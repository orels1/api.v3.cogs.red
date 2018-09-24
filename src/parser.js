const fetch = require('node-fetch');
const { filter, map, compact } = require('lodash');
const jsonlint = require('jsonlint');
const { createResponse } = require('./utils');

const TOKEN = process.env.GITHUB_TOKEN;
const API_ROOT = 'https://api.github.com';
const headers = {
  Authorization: `bearer ${TOKEN}`,
  'Content-Type': 'application/json'
};

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

const graphql = async (username, repo, branch = 'master') => {
  const query = `
    query {
      repoFiles: repository(name: "${repo}", owner: "${username}") {
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
      }
    }
  `;
  try {
    const resp = await fetch(`${API_ROOT}/graphql`, {
      headers,
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

const createError = (message, path, details) => ({
  message,
  path,
  details
});

const parser = (json, version, username, repo) => {
  const errors = [];

  // check if repo is emtpy
  if (!json.data.repoFiles.object.entries.length) {
    errors.push(createError('Repository is empty'));
  }

  // check if repo info.json is missing
  const files = json.data.repoFiles.object.entries;
  if (!filter(files, { name: 'info.json' }).length) {
    errors.push(createError('File is missing', '/info.json'));
  }

  // actual data parsing
  const result = {
    cogs: {
      valid: [],
      broken: [],
      missing: []
    }
  };

  // select mapper
  let mapper = v2Mapper;
  if (version === 'v3') mapper = v3Mapper;

  // check if repo info.json is valid
  try {
    const repoData = jsonlint.parse(
      filter(files, { name: 'info.json' })[0].object.text
    );
    const repoMappedData = mapper.repo(repoData);
    result.repo = {
      ...repoMappedData,
      author: {
        ...repoMappedData.author,
        username
      },
      name: repo
    };
  } catch (e) {
    console.log(e);
    errors.push(createError('Mailformed file', '/info.json', e.message));
  }

  // get cogs
  const cogs = filter(files, { type: 'tree' });
  if (!cogs.length) {
    errors.push(
      createError(
        'No cogs were found',
        '/',
        'Repo can still be added for future use'
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
          'This cog will not be added to cogs.red'
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
        createError('Mailformed file', `/${c.name}/info.json`, e.message)
      );
      result.cogs.broken.push(c.name);
    }
  });
  return { errors, result };
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
