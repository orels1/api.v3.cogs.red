const fetch = require('node-fetch');
const AWS = require('aws-sdk');
const createResponse = require('./createResponse');

const COGS_TABLE = process.env.COGS_TABLE;
const REPOS_TABLE = process.env.REPOS_TABLE;
const IS_OFFLINE = process.env.IS_OFFLINE;
const V1API = 'https://cogs.red/api/v1';

let dynamoDb;

if (IS_OFFLINE === 'true') {
  dynamoDb = new AWS.DynamoDB.DocumentClient({
    region: 'localhost',
    endpoint: 'http://localhost:8000'
  });
} else {
  dynamoDb = new AWS.DynamoDB.DocumentClient();
}

exports.cogs = async () => {
  const start = process.hrtime();
  const resp = await fetch(`${V1API}/cogs`);
  const {
    results: { list: cogs }
  } = await resp.json();

  try {
    await Promise.all(
      cogs.map(cog => {
        const Item = {
          ...cog,
          path: `${cog.author.username}/${cog.repo.name}/${cog.name}`,
          bot_version: [2, 0, 0],
          python_version: [3, 5, 0],
          required_cogs: {},
          authorName: cog.author.username,
          type: 'COG',
          readme: null,
          created: Date.now(),
          updated: cog.updated_at,
          updated_at: undefined,
          links: {
            ...cog.links,
            _repo: undefined,
            _update: undefined,
            _self: undefined
          }
        };

        const params = {
          TableName: COGS_TABLE,
          Item
        };

        return dynamoDb.put(params).promise();
      })
    );
    const end = process.hrtime(start);
    return createResponse({
      saved: cogs,
      time: `${end[0]}${Math.trunc(end[1] / 1000000)}`
    });
  } catch (e) {
    return createResponse(
      {
        error: e.message,
        stack: e.stack
      },
      503
    );
  }
};

exports.repos = async () => {
  const start = process.hrtime();
  const resp = await fetch(`${V1API}/repos`);
  const {
    results: { list: repos }
  } = await resp.json();

  try {
    await Promise.all(
      repos.map(repo => {
        const Item = {
          ...repo,
          path: `${repo.author.username}/${repo.name}`,
          readme: null,
          cogs: undefined,
          created: Date.now(),
          authorName: repo.author.username,
          links: {
            ...repo.links,
            _cogs: undefined,
            _update: undefined,
            _self: undefined
          }
        };

        const params = {
          TableName: REPOS_TABLE,
          Item
        };

        return dynamoDb.put(params).promise();
      })
    );
    const end = process.hrtime(start);
    return createResponse({
      saved: repos,
      time: `${end[0]}${Math.trunc(end[1] / 1000000)}`
    });
  } catch (e) {
    return createResponse(
      {
        error: e.message,
        stack: e.stack
      },
      503
    );
  }
};
