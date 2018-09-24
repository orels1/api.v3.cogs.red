const { merge, omitBy, pickBy, concat, get } = require('lodash');
const fetch = require('node-fetch');
const { getAuth0ManagementToken } = require('./auth');
const Octokit = require('@octokit/rest');
/**
 * Takes the filter object and returns a formatted FilterExpressions for merging
 * @param {Object} filter Object with attributes to filter by. Filtering is done by equality
 * @returns {Object} Containers FilterExpression, ExpressionsAttributeValues and ExpressionAttributeNames
 */
const genFilterExpression = filter => {
  /**
   * Just so I won't go crazy when reading this later
   * This thing processes the <object>.<prop> keys separately, since they need to be aliased piece-by-piece
   * Those are converted into #object.#prop = :object_prop to avoid any possible dynamo collisions
   * Then they are inserted into the main expression (via concat)
   * And then they are seaprately insterted into Attribute Names / Values
   */

  if (!filter) return {};
  // grab '<object>.<prop>' filters
  const compositeKeys = pickBy(filter, (v, k) => k.includes('.'));
  // remove '<object>.<prop>' from the bunch
  const cleanedFilter = omitBy(
    filter,
    (v, k) => typeof v === 'undefined' || k.includes('.')
  );
  if (!Object.keys(cleanedFilter).length && !Object.keys(compositeKeys).length)
    return {};
  return merge(
    {},
    {
      FilterExpression: concat(
        Object.entries(cleanedFilter).map(([key, val]) => `#${key} = :${key}`),
        Object.entries(compositeKeys).map(
          ([key, val]) =>
            `${key
              .split('.')
              .map(k => `#${k}`)
              .join('.')} = :${key.replace('.', '_')}`
        )
      ).join(' AND ')
    },
    // normal keys
    {
      ...(entries => {
        let results = {
          ExpressionAttributeValues: {},
          ExpressionAttributeNames: {}
        };
        entries.forEach(([key, val]) => {
          results.ExpressionAttributeValues[`:${key}`] = val;
          results.ExpressionAttributeNames[`#${key}`] = key;
        });
        return results;
      })(Object.entries(cleanedFilter))
    },
    // composite keys
    {
      ...(entries => {
        let results = {
          ExpressionAttributeValues: {},
          ExpressionAttributeNames: {}
        };
        entries.forEach(([key, val]) => {
          // attribute values (those are same as normal)
          results.ExpressionAttributeValues[`:${key.replace('.', '_')}`] = val;
          // attribute names
          key.split('.').forEach(keyPart => {
            results.ExpressionAttributeNames[`#${keyPart}`] = keyPart;
          });
        });
        return results;
      })(Object.entries(compositeKeys))
    }
  );
};

exports.genFilterExpression = genFilterExpression;

// extract the hidden flag from queryString
const getHiddenFlag = event =>
  (event.queryStringParameters ? event.queryStringParameters : {}).hidden ===
  'true';
exports.getHiddenFlag = getHiddenFlag;

// create a formatted filter object
exports.getHiddenFilter = event =>
  getHiddenFlag(event) ? {} : { hidden: false };

exports.queryByPath = (table, username, path, filter) =>
  merge(
    {},
    {
      TableName: table,
      KeyConditionExpression:
        'authorName = :username AND begins_with(#path, :path)',
      ExpressionAttributeNames: {
        '#path': 'path'
      },
      ExpressionAttributeValues: {
        ':username': username,
        ':path': path
      }
    },
    genFilterExpression(filter)
  );

exports.scan = (table, filter) =>
  merge(
    {},
    {
      TableName: table
    },
    genFilterExpression(filter)
  );

exports.createResponse = (body, statusCode = 200) => ({
  statusCode,
  body: JSON.stringify(body)
});

exports.userCheck = (user, event) => {
  const {
    pathParameters: { username }
  } = event;
  return username === user;
};

exports.getIdToken = async event => {
  const userId =
    get(event, 'requestContext.authorizer.claims.sub') ||
    get(event, 'requestContext.authorizer.principalId');
  try {
    const token = await getAuth0ManagementToken();
    const resp = await fetch(
      `https://cogs.auth0.com/api/v2/users?q=user_id:"${userId}"`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    const json = await resp.json();
    if (!json.length) return null;
    const user = json[0];
    return {
      ghToken: user.identities.filter(i => i.connection === 'github')[0]
        .access_token,
      user: user.name
    };
  } catch (e) {
    console.log(e);
  }
};

exports.createOctokit = token =>
  Octokit({
    headers: {
      accept: 'application/vnd.github.v3+json',
      'user-agent': 'octokit/rest.js v1.2.3',
      authorization: `bearer ${token}`
    }
  });
