const AWS = require('aws-sdk');
const { graphql } = require('./parser');
const {
  getHiddenFlag,
  getHiddenFilter,
  scan,
  createResponse,
  queryByPath,
  getAuth0User,
  userCheck
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
  const hiddenFilter = getHiddenFilter(event);
  const { username, repo, branch = '___', cog } = event.pathParameters;

  const params = queryByPath(
    COGS_TABLE,
    username,
    `${username}/${repo}/${cog}`,
    {
      ...hiddenFilter,
      ...(branch === '___'
        ? { 'repo.default_branch': true }
        : { 'repo.branch': branch })
    }
  );

  try {
    const result = await dynamoDb.query(params).promise();
    if (result.Count) {
      return createResponse({ ...result.Items[0] });
    } else {
      return createResponse({ error: 'Cog not found' }, 404);
    }
  } catch (e) {
    console.error(e);
    return createResponse({ error: 'Could not get cog' }, 503);
  }
};

exports.getCogsInRepo = async event => {
  const { username, repo, branch } = event.pathParameters;
  const hiddenFilter = getHiddenFilter(event);

  const params = queryByPath(COGS_TABLE, username, `${username}/${repo}`, {
    ...hiddenFilter,
    ...(typeof branch === 'undefined'
      ? { 'repo.default_branch': true }
      : { 'repo.branch': branch })
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

const remove = async (cogPath, authorName) => {
  try {
    console.log('removing', cogPath);
    await dynamoDb
      .delete({
        Key: {
          path: cogPath,
          authorName
        },
        TableName: COGS_TABLE
      })
      .promise();
    return;
  } catch (e) {
    console.error(e);
    return {
      error: `Could not delete cog ${cogPath}`,
      error_details: e
    };
  }
};

exports.remove = remove;

exports.removeCogByPath = async event => {
  const user = await getAuth0User(event);
  if (!user) {
    return createResponse({
      error: 'did not find registered user'
    });
  }
  if (!userCheck(user.name, event))
    return createResponse(
      {
        error:
          'You are trying to perform an operation on behalf of different user!'
      },
      401
    );
  const { username, repo, cog, branch } = event.pathParameters;
  const cogPath = `${username}/${repo}/${c}/${branch}`;
  const result = await remove(cogPath, user.name);
  if (!result.error) {
    return createResponse({});
  } else {
    return createResponse(result, 503);
  }
};

exports.removeCogsByRepo = async event => {
  const user = await getAuth0User(event);
  if (!user) {
    return createResponse({
      error: 'did not find registered user'
    });
  }
  if (!userCheck(user.name, event))
    return createResponse(
      {
        error:
          'You are trying to perform an operation on behalf of different user!'
      },
      401
    );
  const { username, repo, branch } = event.pathParameters;
  const params = queryByPath(COGS_TABLE, username, `${username}/${repo}/`, {
    'repo.branch': branch
  });

  try {
    const cogs = (await dynamoDb.query(params).promise()).Items;
    const results = await Promise.all(
      cogs.map(c =>
        remove(`${username}/${repo}/${c.name}/${branch}`, user.name)
      )
    );
    const failed = results.filter(i => i && i.error);
    console.log(results);
    if (failed.length) {
      return createResponse(
        {
          error: failed.map(i => i.error).join('\n'),
          error_details: failed.map(i => i.error_details).join('\n\n')
        },
        503
      );
    }
    return createResponse({});
  } catch (e) {
    console.error(e);
  }
};
