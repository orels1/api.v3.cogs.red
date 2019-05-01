const AWS = require('aws-sdk');
const { omit } = require('lodash');
const { graphql } = require('./parser');
const {
  getHiddenFlag,
  getHiddenFilter,
  getUnapprovedFilter,
  getVersionFlag,
  cogVersionFilter,
  scan,
  createResponse,
  queryByPath,
  getAuth0User,
  userCheck,
  filterIp
} = require('./utils');
const { notify } = require('./discord');
const { getBody } = require('./middlewares');

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

const getMethod = (hiddenFilter = {}, unapprovedFilter = {}) => {
  const params = scan(COGS_TABLE, {
    ...hiddenFilter,
    ...unapprovedFilter
  });
  return dynamoDb.scan(params).promise();
};

exports.getMethod = getMethod;

exports.get = async event => {
  const hiddenFilter = getHiddenFilter(event);
  const unapprovedFilter = getUnapprovedFilter(event, true);
  const versionFlag = getVersionFlag(event);

  try {
    const result = await getMethod(hiddenFilter, unapprovedFilter);
    let filtered = result.Items;
    if (versionFlag) {
      filtered = cogVersionFilter(filtered, versionFlag);
    }
    return createResponse({
      results: filterIp(filtered),
      count: result.Count
    });
  } catch (e) {
    console.error(e);
    return createResponse({ error: 'Could not get cogs' }, 503);
  }
};

exports.getOne = async event => {
  const hiddenFilter = getHiddenFilter(event);
  const unapprovedFilter = getUnapprovedFilter(event, true);
  const versionFlag = getVersionFlag(event);
  const { username, repo, branch = '___', cog } = event.pathParameters;

  const params = queryByPath(
    COGS_TABLE,
    username,
    `${username}/${repo}/${cog}`,
    {
      ...hiddenFilter,
      ...unapprovedFilter,
      ...(branch === '___'
        ? { 'repo.default_branch': true }
        : { 'repo.branch': branch })
    }
  );

  try {
    const result = await dynamoDb.query(params).promise();
    if (result.Count) {
      let filtered = result.Items;
      if (versionFlag) {
        filtered = cogVersionFilter(filtered, versionFlag);
      }
      return createResponse({ ...filterIp(filtered[0]) });
    } else {
      return createResponse({ error: 'Cog not found' }, 404);
    }
  } catch (e) {
    console.error(e);
    return createResponse({ error: 'Could not get cog' }, 503);
  }
};

const getCogsInRepoMethod = async (
  username,
  repo,
  branch,
  hiddenFilter = {},
  unapprovedFilter = {}
) => {
  const params = queryByPath(COGS_TABLE, username, `${username}/${repo}`, {
    ...hiddenFilter,
    ...unapprovedFilter,
    ...(typeof branch === 'undefined'
      ? { 'repo.default_branch': true }
      : { 'repo.branch': branch })
  });

  return dynamoDb.query(params).promise();
};

exports.getCogsInRepoMethod = getCogsInRepoMethod;

exports.getCogsInRepo = async event => {
  const { username, repo, branch } = event.pathParameters;
  const hiddenFilter = getHiddenFilter(event);
  const unapprovedFilter = getUnapprovedFilter(event, true);
  const versionFlag = getVersionFlag(event);

  try {
    const result = await getCogsInRepoMethod(
      username,
      repo,
      branch,
      hiddenFilter,
      unapprovedFilter
    );
    if (result.Count) {
      let filtered = result.Items;
      if (versionFlag) {
        filtered = cogVersionFilter(filtered, versionFlag);
      }
      return createResponse({
        results: filterIp(filtered),
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
  const unapprovedFilter = getUnapprovedFilter(event, true);
  const versionFlag = getVersionFlag(event, true);

  const params = queryByPath(COGS_TABLE, username, username, {
    ...hiddenFilter,
    ...unapprovedFilter
  });

  try {
    const result = await dynamoDb.query(params).promise();
    if (result.Count) {
      let filtered = result.Items;
      if (versionFlag) {
        filtered = cogVersionFilter(filtered, versionFlag);
      }
      return createResponse({
        results: filterIp(filtered),
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

const updateProp = async (cogPath, authorName, key, value) => {
  try {
    await dynamoDb
      .update({
        Key: {
          path: cogPath,
          authorName
        },
        ExpressionAttributeNames: {
          [`#key`]: `${key}`
        },
        ExpressionAttributeValues: {
          [`:value`]: value
        },
        UpdateExpression: `SET #key = :value`,
        TableName: COGS_TABLE
      })
      .promise();
    return {};
  } catch (e) {
    console.error(e);
    return {
      error: `Could not update ${key} for cog ${cogPath}`,
      error_details: e
    };
  }
};

exports.updateProp = updateProp;

const hide = async (cogPath, authorName, state) => {
  return updateProp(cogPath, authorName, 'hidden', state);
};

exports.hide = hide;

exports.report = async event => {
  const {
    pathParameters,
    headers: { 'X-Forwarded-For': ip = '127.0.0.1' }
  } = event;
  const { err, body } = getBody(event);
  if (err) {
    return createResponse({ ...err }, 400);
  }
  const { username, repo, cog, branch } = pathParameters;
  const cogPath = `${username}/${repo}/${cog}/${branch}`;
  const reportTypes = ['api_abuse', 'malware', 'license'];
  const { type, comment } = body;
  if (!reportTypes.includes(type)) {
    return createResponse(
      {
        error: 'Wrong report type',
        error_details: `Reports can only be of types: ${reportTypes.join(', ')}`
      },
      400
    );
  }
  let shouldNotifyQa = false;
  let reportsCount = 0;
  const notifyThresholds = [1, 5, 10, 15, 20, 30, 50];
  try {
    const { Item } = await dynamoDb
      .get({
        Key: {
          path: cogPath,
          authorName: username
        },
        TableName: COGS_TABLE
      })
      .promise();
    if (!Item) {
      return createResponse(
        {
          error: 'No such cog found'
        },
        404
      );
    }
    if (Item.reports.find(i => i.ip === ip)) {
      return createResponse(
        {
          error: 'You have already reported this cog'
        },
        400
      );
    }
    await dynamoDb
      .update({
        Key: {
          path: cogPath,
          authorName: username
        },
        ExpressionAttributeValues: {
          ':report': [{ type, ip, comment, timestamp: Date.now() }]
        },
        UpdateExpression: `SET reports = list_append(reports, :report)`,
        TableName: COGS_TABLE
      })
      .promise();
    reportsCount = Item.reports.length + 1;
    if (notifyThresholds.includes(reportsCount)) {
      shouldNotifyQa = true;
    }
  } catch (e) {
    console.error(e);
    return createResponse(
      {
        error: `Could not report cog ${cogPath}`,
        error_details: e
      },
      503
    );
  }

  if (shouldNotifyQa) {
    await notify({
      title: 'A cog just got reported',
      content: `
        [${cogPath}](https://dev.v3.cogs.red/${cogPath})

        Total reports count: **${reportsCount}**

        ${comment ? 'Last report comment: ' : ''}${comment}
      `,
      level: 'danger'
    });
  }
  return createResponse({
    results: 'Cog was successfully reported'
  });
};

exports.notified = async (cogPath, authorName) => {
  return updateProp(cogPath, authorName, 'qaNotified', true);
};

exports.hide = hide;

exports.approve = async (cogPath, authorName, state) => {
  try {
    await dynamoDb
      .update({
        Key: {
          path: cogPath,
          authorName
        },
        ExpressionAttributeNames: {
          '#repo': 'repo',
          '#type': 'type'
        },
        ExpressionAttributeValues: {
          ':value': state
        },
        UpdateExpression: `SET #repo.#type = :value`,
        TableName: COGS_TABLE
      })
      .promise();
    return {};
  } catch (e) {
    console.error(e);
    return {
      error: `Could not update repo.type for cog ${cogPath}`,
      error_details: e
    };
  }
};
