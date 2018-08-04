const AWS = require('aws-sdk');
const { graphql } = require('./parser');
const createResponse = require('./createResponse');
const { queryByPath } = require('./utils');

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
  const params = {
    TableName: REPOS_TABLE,
    ScanFilter: {
      hidden: {
        ComparisonOperator: 'NE',
        AttributeValueList: [true]
      }
    }
  };

  try {
    const result = await dynamoDb.scan(params).promise();
    return createResponse({ results: result.Items, count: result.Count });
  } catch (e) {
    console.error(e);
    return createResponse({ error: 'Could not get repos' }, 503);
  }
};

exports.getOne = async event => {
  const { username, repo } = event.pathParameters;

  const params = {
    TableName: REPOS_TABLE,
    Key: {
      authorName: username,
      path: `${username}/${repo}`
    }
  };

  try {
    const result = await dynamoDb.get(params).promise();
    if (result.Item) {
      return createResponse({ ...result.Item });
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

  const params = queryByPath(REPOS_TABLE, username, username);

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
