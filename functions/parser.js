const app = require('express')();
const router = require('express').Router();
const cors = require('cors');
const fetch = require('node-fetch');
const jsonlint = require('jsonlint');
const { filter, map, compact, get } = require('lodash');
const Firestore = require('@google-cloud/firestore');
const functions = require('firebase-functions');
const { json } = require('./middleware');
const { nameValidityCheck } = require('./utils');

const firestore = new Firestore({
  projectId: 'starlit-channel-244200'
});
const API_ROOT = 'https://api.github.com';
const TOKEN = functions.config().system.gh_key;

app.use(json);

app.use('/parser', router);

const headers = token => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json'
});

const v2Mapper = {
  cog: data => ({
    author: {
      name: data.AUTHOR
    },
    short: data.SHORT || '',
    description: data.DESCRIPTION || '',
    tags: data.TAGS || [],
    hidden: data.HIDDEN || false
  }),
  repo: data => ({
    author: {
      name: data.AUTHOR
    },
    short: data.SHORT || '',
    description: data.DESCRIPTION || '',
    tags: data.TAGS || []
  })
};

const v3Mapper = {
  cog: data => ({
    ...data
  }),
  repo: data => ({
    ...data
  })
};

const graphql = async (username, repo, branch = 'master', token = TOKEN) => {
  const query = `
    query {
      repoFiles: repository(name: "${repo}", owner: "${username}") {
        defaultBranchRef{
          name
        }
        object(expression: "${branch}:") {
          ... on Tree {
            entries {
              name
              type
              object {
                ... on Blob {
                  text
                }
              }
              object {
                ... on Tree {
                  entries {
                    name
                    type
                    object {
                      ... on Blob {
                        text
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
    }
  `;
  try {
    const resp = await fetch(`${API_ROOT}/graphql`, {
      headers: headers(token),
      method: 'POST',
      body: JSON.stringify({ query })
    });
    const json = await resp.json();
    return json;
  } catch (e) {
    console.error(e);
    return { error: e.message };
  }
};

const createError = (message, path, details, level) => ({
  message,
  path,
  details,
  level
});

const parser = (json, username, repo) => {
  const errors = [];

  // check if repo is empty
  if (!json.data.repoFiles.object.entries.length) {
    errors.push(createError('Repository is empty', '', '', 'error'));
  }

  // check if repo info.json is missing
  const files = json.data.repoFiles.object.entries;
  if (!filter(files, { name: 'info.json' }).length) {
    errors.push(createError('File is missing', '/info.json', '', 'error'));
  }

  // actual data parsing
  const result = {
    cogs: {
      valid: [],
      broken: [],
      missing: []
    },
    defaultBranch: json.data.repoFiles.defaultBranchRef.name
  };

  let mapper = v2Mapper;
  let version = '2';

  // check if repo info.json is valid
  try {
    const repoData = jsonlint.parse(
      filter(files, { name: 'info.json' })[0].object.text
    );
    // select mapper
    if (!Object.keys(repoData).includes('AUTHOR')) {
      mapper = v3Mapper;
      version = '3';
    }
    const repoMappedData = mapper.repo(repoData);
    result.repo = {
      ...repoMappedData,
      author: {
        ...repoMappedData.author,
        username
      },
      name: repo,
      version,
      readme: get(
        files.find(f =>
          ['README.MD', 'readme.md', 'readme.MD'].includes(f.name)
        ),
        'object.text',
        null
      )
    };
  } catch (e) {
    console.log(e);
    errors.push(
      createError('Malformed file', '/info.json', e.message, 'error')
    );
  }

  // get cogs
  let cogs = filter(files, { type: 'tree' });
  if (!cogs.length) {
    errors.push(
      createError(
        'No cogs were found',
        '/',
        'Repo can still be added for future use',
        'warning'
      )
    );
  }
  // filter out invalid names
  cogs = filter(cogs, i => nameValidityCheck(i.name));
  cogs.forEach(c => {
    // check if cogs have info.jsons
    if (!filter(c.object.entries, { name: 'info.json' }).length) {
      errors.push(
        createError(
          'Cog is missing an info.json',
          `/${c.name}`,
          'This cog will not be added to cogs.red',
          'warning'
        )
      );
      result.cogs.missing.push(c.name);
      return;
    }
    // check if cog info.json is valid
    const cogInfoJson = filter(c.object.entries, { name: 'info.json' })[0]
      .object.text;
    try {
      const info = jsonlint.parse(cogInfoJson);
      const cogMappedData = mapper.cog(info);
      result.cogs.valid.push({
        ...cogMappedData,
        name: c.name,
        author: {
          ...cogMappedData.author,
          username
        }
      });
    } catch (e) {
      errors.push(
        createError(
          'Malformed file',
          `/${c.name}/info.json`,
          e.message,
          'error'
        )
      );
      result.cogs.broken.push(c.name);
    }
  });
  return { errors, result, version };
};

router.get('/:username/:repo/:branch', cors(), async (req, res) => {
  if (!req.params)
    return res.status(400).send(
      {
        error: 'No parameters supplied!'
      },
      400
    );

  const { username, repo, branch = 'master' } = req.params;

  const json = await graphql(username, repo, branch);
  if (json.error || (json.errors && json.errors.length)) {
    return res.status(503).send({
      error: json.error || (json.errors && json.errors[0].message)
    });
  }

  const { errors, result } = parser(json, username, repo);
  return res.send({
    errors,
    result
  });
});

const saveRepo = async ({ username, repo, branch, result, version }) => {
  let created = Date.now();
  let updated = null;
  let hidden = false;
  let type = 'unapproved';

  // if exists - use old creation date and new update date
  const repoPath = `${username}/${repo}/${branch}`;
  const repoInDb = await firestore
    .collection('repos')
    .where('path', '==', repoPath)
    .get();
  if (repoInDb.size) {
    const repoData = repoInDb.docs[0].data();
    // using already created timestamp for consistency
    updated = created;
    created = repoData.created;
    hidden = repoData.hidden;
    type = repoData.type;
  }

  // save repo
  const updatedRepo = {
    ...result.repo,
    path: `${username}/${repo}/${branch}`,
    authorName: username,
    type,
    short: result.repo.short.length ? result.repo.short : null,
    version,
    branch,
    defaultBranch: result.defaultBranch === branch,
    created,
    updated,
    hidden,
    links: {
      self: `/${username}/${repo}/${branch}`
    }
  };

  try {
    if (repoInDb.size) {
      await firestore
        .collection('repos')
        .doc(repoInDb.docs[0].id)
        .update(updatedRepo);
    } else {
      await firestore.collection('repos').add(updatedRepo);
    }

    return {
      result: updatedRepo
    };
  } catch (e) {
    console.error(e);
    return {
      error: `Could not save repo ${repo}`,
      error_details: e
    };
  }
};

const saveCog = async (
  cog,
  username,
  repo,
  branch,
  result,
  version,
  savedRepo
) => {
  const { name } = cog;
  const {
    result: { type }
  } = savedRepo;

  // cogs.red specific attributes
  let created = Date.now();
  let updated = null;
  let hidden = false;
  let qaNotified = false;

  // if exists - use old creation date and new update date
  const cogPath = `${username}/${repo}/${branch}/${name}`;
  const cogInDb = await firestore
    .collection('cogs')
    .where('path', '==', cogPath)
    .get();
  if (cogInDb.size) {
    const cogData = cogInDb.docs[0].data();
    // using already created timestamp for consistency
    updated = created;
    created = cogData.created;
    hidden = cogData.hidden;
    qaNotified = cogData.qaNotified;
  }

  // save cog
  const updatedCog = {
    ...cog,
    path: `${username}/${repo}/${branch}/${name}`,
    authorName: username,
    repoName: repo,
    branchName: branch,
    repoType: type,
    short: cog.short.length ? cog.short : null,
    repo: {
      name: repo,
      type,
      branch,
      defaultBranch: result.defaultBranch === branch
    },
    botVersion: cog.bot_version || version === '3' ? [3, 0, 0] : [2, 0, 0],
    pythonVersion:
      cog.python_version || version === '3' ? [3, 6, 4] : [3, 5, 0],
    requiredCogs: {},
    created,
    updated,
    hidden,
    reports,
    qaNotified,
    links: {
      self: `/${username}/${repo}/${branch}/${name}`
    }
  };

  return new Promise(async resolve => {
    try {
      if (cogInDb.size) {
        await firestore
          .collection('cogs')
          .doc(cogInDb.docs[0].id)
          .update(updatedCog);
      } else {
        await firestore.collection('cogs').add(updatedCog);
      }
      resolve(updatedCog);
    } catch (e) {
      resolve({
        error: `Could not save cog ${name}`,
        error_details: e.message
      });
    }
  });
};

const save = async (username, repo, branch, token) => {
  try {
    console.log('saving fresh repo');
    const json = await graphql(username, repo, branch, token);
    const { result, version } = parser(json, username, repo);

    console.log('parsed repo', repo);
    const savedRepo = await saveRepo({
      username,
      repo,
      branch,
      result,
      version
    });

    console.log('saving cogs', result.cogs.valid.map(i => i.name).join(', '));

    const savedCogs = await Promise.all(
      result.cogs.valid.map(c =>
        saveCog(c, username, repo, branch, result, version, savedRepo)
      )
    );

    console.log('saved Cogs', savedCogs.map(i => i.name).join(', '));

    return {
      repo: savedRepo,
      cogs: savedCogs
    };
  } catch (e) {
    console.error(e);
    return {};
  }
};

// app.post('/:username/:repo/:branch', async (req, res) => {
//   const { username, repo, branch } = req.params;
//   const result = await save(username, repo, branch);
//   res.send(result);
// });

exports.parser = app;
exports.save = save;
