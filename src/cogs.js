const AWS = require('aws-sdk');
const { graphql } = require('./parser');
const {
  getHiddenFlag,
  getHiddenFilter,
  scan,
  createResponse,
  queryByPath
} = require('./utils');

const COGS_TABLE = process.env.COGS_TABLE;
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
  const params = scan(COGS_TABLE, { ...hiddenFilter });

  try {
    const result = await dynamoDb.scan(params).promise();
    return createResponse({
      results: result.Items,
      count: result.Count
    });
  } catch (e) {
    console.error(e);
    return createResponse({ error: 'Could not get cogs' }, 503);
  }
};

exports.getOne = async event => {
  const hidden = getHiddenFlag(event);
  const { username, repo, cog } = event.pathParameters;

  const params = {
    TableName: COGS_TABLE,
    Key: {
      authorName: username,
      path: `${username}/${repo}/${cog}`
    }
  };

  try {
    const result = await dynamoDb.get(params).promise();
    if (result.Item && (hidden || !result.Item.hidden)) {
      return createResponse({ ...result.Item });
    } else {
      return createResponse({ error: 'Cog not found' }, 404);
    }
  } catch (e) {
    console.error(e);
    return createResponse({ error: 'Could not get cog' }, 503);
  }
};

exports.getCogsInRepo = async event => {
  const { username, repo } = event.pathParameters;
  const hiddenFilter = getHiddenFilter(event);

  const params = queryByPath(COGS_TABLE, username, `${username}/${repo}`, {
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
      return createResponse({ error: 'Cogs not found' }, 404);
    }
  } catch (e) {
    console.error(e);
    return createResponse({ error: 'Could not get cogs for repo' }, 503);
  }
};

exports.getCogsForUser = async event => {
  const { username } = event.pathParameters;
  const hiddenFilter = getHiddenFilter(event);

  const params = queryByPath(COGS_TABLE, username, username, {
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
      return createResponse({ error: 'Cogs not found' }, 404);
    }
  } catch (e) {
    console.error(e);
    return createResponse({ error: 'Could not get cogs for repo' }, 503);
  }
};
