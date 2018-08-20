const AWS = require('aws-sdk');
const { graphql } = require('./parser');
const {
  getHiddenFlag,
  getHiddenFilter,
  scan,
  createResponse,
  queryByPath
} = require('./utils');

const REPOS_TABLE = process.env.REPOS_TABLE;
const IS_OFFLINE = process.env.IS_OFFLINE;

let dynamoDb;

if (IS_OFFLINE === 'true') {
  dynamoDb = new AWS.DynamoDB.DocumentClient({
    region: 'localhost',
    endpoint: 'http://localhost:8000'
  });
} else {
  dynamoDb = new AWS.DynamoDB.DocumentClient();
}

exports.get = async event => {
  const hiddenFilter = getHiddenFilter(event);
  const params = scan(REPOS_TABLE, { ...hiddenFilter });

  try {
    const result = await dynamoDb.scan(params).promise();
    return createResponse({ results: result.Items, count: result.Count });
  } catch (e) {
    console.error(e);
    return createResponse({ error: 'Could not get repos' }, 503);
  }
};

exports.getOne = async event => {
  const { username, repo, branch } = event.pathParameters;
  const hiddenFilter = getHiddenFilter(event);

  const params = queryByPath(REPOS_TABLE, username, `${username}/${repo}`, {
    ...hiddenFilter,
    ...(typeof branch === 'undefined'
      ? { default_branch: true }
      : { branch: branch })
  });

  try {
    const result = await dynamoDb.query(params).promise();
    if (result.Count) {
      return createResponse({ ...result.Items[0] });
    } else {
      return createResponse({ error: 'Repo not found' }, 404);
    }
  } catch (e) {
    console.error(e);
    return createResponse({ error: 'Could not get Repo' }, 503);
  }
};

exports.getReposForUser = async event => {
  const { username } = event.pathParameters;
  const hiddenFilter = getHiddenFilter(event);

  const params = queryByPath(REPOS_TABLE, username, username, {
    ...hiddenFilter
  });

  try {
    const result = await dynamoDb.query(params).promise();
    if (result.Count) {
      return createResponse({
        results: result.Items,
        count: result.Count
      });
    } else {
      return createResponse({ error: 'User not found' }, 404);
    }
  } catch (e) {
    console.error(e);
    return createResponse({ error: 'Could not get repos for user' }, 503);
  }
};
