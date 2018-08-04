const AWS = require('aws-sdk');
const { graphql } = require('./parser');
const { createResponse, queryByPath } = require('./utils');

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

exports.test = async event => {
  const data = await graphql('orels1', 'ORELS-Cogs');
  const cog = data.cogs.valid[0];

  const Item = {
    path: `orels1/ORELS-Cogs/${cog.name}`,
    name: cog.name,
    bot_version: [2, 0, 0],
    python_version: [3, 5, 0],
    required_cogs: {},
    type: 'COG',
    ...cog,
    author: {
      ...cog.author,
      username: 'orels1'
    },
    repo: {
      name: data.repo.name,
      type: 'unapproved'
    },
    readme: '# test',
    links: {
      _self: 'test/link'
    },
    created: Date.now(),
    updated: Date.now()
  };

  const params = {
    TableName: COGS_TABLE,
    Item
  };

  try {
    await dynamoDb.put(params).promise();
    return createResponse({ ...Item });
  } catch (e) {
    console.error(e);
    return createResponse({ error: 'Could not save cog ' }, 400);
  }
};

exports.get = async event => {
  const params = {
    TableName: COGS_TABLE
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
    return createResponse({ error: 'Could not get cogs' }, 503);
  }
};

exports.getOne = async event => {
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
    if (result.Item) {
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

  const params = queryByPath(COGS_TABLE, username, `${username}/${repo}`);

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

  const params = queryByPath(COGS_TABLE, username, username);

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
