const fetch = require('node-fetch');
const AWS = require('aws-sdk');
const { filter, map, compact, get } = require('lodash');
const jsonlint = require('jsonlint');
const { createResponse, getIdToken, queryByPath } = require('./utils');

const COGS_TABLE = process.env.COGS_TABLE;
const REPOS_TABLE = process.env.REPOS_TABLE;
const IS_OFFLINE = process.env.IS_OFFLINE;
const TOKEN = process.env.GITHUB_TOKEN;
const API_ROOT = 'https://api.github.com';
const headers = token => ({
  Authorization: `bearer ${token}`,
  'Content-Type': 'application/json'
});

let dynamoDb;

if (IS_OFFLINE === 'true') {
  dynamoDb = new AWS.DynamoDB.DocumentClient({
    region: 'localhost',
    endpoint: 'http://localhost:8000'
  });
} else {
  dynamoDb = new AWS.DynamoDB.DocumentClient();
}

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

exports.graphql = graphql;

const createError = (message, path, details, level) => ({
  message,
  path,
  details,
  level
});

const parser = (json, username, repo) => {
  const errors = [];

  // check if repo is emtpy
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
  const cogs = filter(files, { type: 'tree' });
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
        name: c.name,
        ...cogMappedData,
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

exports.handler = async event => {
  if (!event.pathParameters)
    return createResponse(
      {
        error: 'No paramaters supplied!'
      },
      400
    );

  const { username, repo, version, branch = 'master' } = event.pathParameters;

  const json = await graphql(username, repo, branch);
  if (json.error || (json.errors && json.errors.length)) {
    return createResponse(
      {
        error: json.error || (json.errors && json.errors[0].message)
      },
      503
    );
  }

  const { errors, result } = parser(json, version, username, repo);
  return createResponse({
    errors,
    result
  });
};

const saveRepo = async ({ username, repo, branch, result, version }) => {
  // check if repo exists
  const repoGetParams = queryByPath(
    REPOS_TABLE,
    username,
    `${username}/${repo}`,
    {
      hidden: true,
      branch
    }
  );

  let created = Date.now();
  let updated = null;
  let hidden = false;
  let type = 'unapproved';

  // if exists - use old creation date and new update date
  const repoInDb = await dynamoDb.query(repoGetParams).promise();
  if (repoInDb.Count) {
    // using already created timestamp for consistency
    updated = created;
    created = repoInDb.Items[0].created;
    hidden = repoInDb.hidden;
    type = repoInDb.type;
  }

  // save repo
  const repoParams = {
    TableName: REPOS_TABLE,
    Item: {
      ...result.repo,
      path: `${username}/${repo}/${branch}`,
      authorName: username,
      type,
      short: result.repo.short.length ? result.repo.short : null,
      version,
      branch,
      default_branch: result.defaultBranch === branch,
      created,
      updated,
      hidden,
      links: {
        self: `/${username}/${repo}/${branch}`
      }
    }
  };

  try {
    await dynamoDb.put(repoParams).promise();
    return {
      result: {
        ...repoParams.Item
      }
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
  // check if cog exists
  const cogGetParams = queryByPath(
    COGS_TABLE,
    username,
    `${username}/${repo}/${name}`,
    {
      hidden: true,
      branch
    }
  );

  // cogs.red specific attributes
  let created = Date.now();
  let updated = null;
  let hidden = false;
  let reports = [];
  let qaNotified = false;

  // if exists - use old creation date and new update date
  const cogInDb = await dynamoDb.query(cogGetParams).promise();
  if (cogInDb.Count) {
    // using already created timestamp for consistency
    updated = created;
    created = cogInDb.Items[0].created;
    hidden = cogInDb.hidden;
    reports = cogInDb.reports;
    qaNotified = cogInDb.qaNotified;
  }

  // save cog
  const cogParams = {
    TableName: COGS_TABLE,
    Item: {
      ...cog,
      path: `${username}/${repo}/${name}/${branch}`,
      authorName: username,
      short: cog.short.length ? cog.short : null,
      repo: {
        name: repo,
        type,
        branch,
        default_branch: result.defaultBranch === branch
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
    }
  };

  return new Promise(async resolve => {
    try {
      await dynamoDb.put(cogParams).promise();
      resolve(cogParams.Item);
    } catch (e) {
      resolve({
        error: `Could not save cog ${name}`,
        error_details: e.message
      });
    }
  });
};

const save = async (auth0User, { username, repo, branch }) => {
  try {
    const { ghToken } = await getIdToken(auth0User);
    const json = await graphql(username, repo, branch, ghToken);
    const { result, version } = parser(json, username, repo);

    const savedRepo = await saveRepo({
      username,
      repo,
      branch,
      result,
      version
    });

    const savedCogs = await Promise.all(
      result.cogs.valid.map(c =>
        saveCog(c, username, repo, branch, result, version, savedRepo)
      )
    );

    return createResponse({
      repo: savedRepo,
      cogs: savedCogs
    });
  } catch (e) {
    console.error(e);
    return createResponse({});
  }
};

exports.save = save;
