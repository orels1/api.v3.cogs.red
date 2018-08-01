const fetch = require('node-fetch');
const { filter, map, compact } = require('lodash');
const createResponse = require('./createResponse');

const TOKEN = process.env.GITHUB_TOKEN;
const API_ROOT = 'https://api.github.com';
const headers = {
  Authorization: `bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

const v2Mapper = {
  cog: data => ({
    author: {
      name: data.AUTHOR
    },
    short: data.SHORT || "",
    description: data.DESCRIPTION || "",
    tags: data.TAGS || [],
    hidden: data.HIDDEN || false
  }),
  repo: data => ({
    author: {
      name: data.AUTHOR
    },
    short: data.SHORT || "",
    description: data.DESCRIPTION || "",
    tags: data.TAGS || []
  })
}

const v3Mapper = {
  cog: data => ({
    ...data
  }),
  repo: data => ({
    ...data
  })
}

const graphql = async (username, repo, branch = 'master', version = 'v2') => {
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
      body: JSON.stringify({ query }),
    });
    const json = await resp.json();

    // check if repo exists and have info.json
    // bail if any of these fail
    if (!json.data.repoFiles) return ({ error: json.errors[0].message });
    if (!json.data.repoFiles.object.entries.length) return ({ error: 'Empty repo' });
    const files = json.data.repoFiles.object.entries;
    if (!filter(files, { name: 'info.json' }).length) return ({ error: 'No repo info.json' });

    // actual data parsing
    const result = {
      cogs: {
        valid: [],
        broken: [],
        missing: [],
      },
    };

    // select mapper
    let mapper = v2Mapper;
    if (version === 'v3') mapper = v3Mapper;

    // get repo info
    try {
      const repoData = JSON.parse(filter(files, { name: 'info.json' })[0].object.text);
      const repoMappedData = mapper.repo(repoData);
      result.repo = {
        ...repoMappedData,
        author: {
          ...repoMappedData.author,
          username,
        },
        name: repo,
      };
    } catch (e) {
      result.repo = { error: 'Mailformed repo info.json' };
    }
    // get cogs
    const cogs = filter(files, { type: 'tree' });
    if (!cogs.length) result.cogs.error = 'No cogs were found';
    cogs.forEach((c) => {
      // if cog does not have info.json
      if (!filter(c.object.entries, { name: 'info.json' }).length) {
        result.cogs.missing.push(c.name);
        return;
      }
      const cogInfoJson = filter(c.object.entries, { name: 'info.json' })[0].object.text;
      try {
        const info = JSON.parse(cogInfoJson);
        const cogMappedData = mapper.cog(info);
        result.cogs.valid.push({
          name: c.name,
          ...cogMappedData,
          author: {
            ...cogMappedData.author,
            username,
          }
        });
      } catch (e) {
        result.cogs.broken.push(c.name);
      }
    });
    return result;
  } catch (e) {
    console.error(e);
    return ({ error: e.message });
  }
};

exports.graphql = graphql;

exports.handler = async (event) => {
  if (!event.pathParameters) return createResponse({
    error: 'No paramaters supplied!'
  }, 400);

  const {
    username,
    repo,
    version
  } = event.pathParameters;

  let branch = 'master';

  if (event.queryStringParameters) branch = event.queryStringParameters.branch;

  const result = await graphql(username, repo, branch, version);
  if (result.error) return createResponse({
    error: result.error
  }, 503);

  return createResponse(result);
}
