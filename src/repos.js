const AWS = require('aws-sdk');
const { graphql } = require('./parser');
const {
  getHiddenFilter,
  getUnapprovedFilter,
  getVersionFilter,
  scan,
  createResponse,
  queryByPath,
  getAuth0User,
  userCheck,
  staffCheck
} = require('./utils');
const { notify } = require('./discord');

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
  const unapprovedFilter = getUnapprovedFilter(event);
  const versionFilter = getVersionFilter(event);
  const params = scan(REPOS_TABLE, {
    ...hiddenFilter,
    ...unapprovedFilter,
    ...versionFilter
  });

  console.log(params);

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
  const unapprovedFilter = getUnapprovedFilter(event);

  const params = queryByPath(REPOS_TABLE, username, `${username}/${repo}`, {
    ...hiddenFilter,
    ...unapprovedFilter,
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
  const unapprovedFilter = getUnapprovedFilter(event);

  const params = queryByPath(REPOS_TABLE, username, username, {
    ...hiddenFilter,
    ...unapprovedFilter
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

const remove = async (repoPath, authorName) => {
  try {
    await dynamoDb
      .delete({
        Key: {
          path: repoPath,
          authorName
        },
        TableName: REPOS_TABLE
      })
      .promise();
    return;
  } catch (e) {
    console.error(e);
    return {
      error: `Could not delete repo ${repoPath}`,
      error_details: e
    };
  }
};

exports.remove = remove;

exports.removeRepoByPath = async event => {
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
  const repoPath = `${username}/${repo}/${branch}`;
  const result = await remove(repoPath, user.name);
  if (result && result.error) {
    return createResponse(result, 503);
  }
  return createResponse(result);
};

const hide = async (repoPath, authorName, state) => {
  try {
    await dynamoDb
      .update({
        Key: {
          path: repoPath,
          authorName
        },
        ExpressionAttributeNames: {
          '#hidden': 'hidden'
        },
        ExpressionAttributeValues: {
          ':hidden': state
        },
        UpdateExpression: `SET #hidden = :hidden`,
        TableName: REPOS_TABLE
      })
      .promise();
    return {};
  } catch (e) {
    console.error(e);
    return {
      error: `Could not hide repo ${repoPath}`,
      error_details: e
    };
  }
};

exports.hide = hide;

exports.hideRepoByPath = async event => {
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
  const state = JSON.parse(event.body).hidden;
  const repoPath = `${username}/${repo}/${branch}`;
  const result = await hide(repoPath, user.name, state);
  if (result && result.error) {
    return createResponse(result, 503);
  }
  return createResponse({
    result: `Repo ${repoPath} successfully hidden`
  });
};

const updateProp = async (repoPath, authorName, key, value) => {
  try {
    const { Item } = await dynamoDb
      .get({
        Key: {
          path: repoPath,
          authorName
        },
        TableName: REPOS_TABLE
      })
      .promise();
    console.log(Item);
    if (!Item) {
      return {
        error: `Repo ${repoPath} does not exist`
      };
    }
    await dynamoDb
      .update({
        Key: {
          path: repoPath,
          authorName
        },
        ExpressionAttributeNames: {
          [`#key`]: `${key}`
        },
        ExpressionAttributeValues: {
          [`:value`]: value
        },
        UpdateExpression: `SET #key = :value`,
        TableName: REPOS_TABLE
      })
      .promise();
    return {};
  } catch (e) {
    console.error(e);
    return {
      error: `Could not update ${key} for repo ${repoPath}`,
      error_details: e
    };
  }
};

exports.approve = async (repoPath, authorName, state) => {
  return await updateProp(repoPath, authorName, 'type', state);
};

exports.approveByPath = async event => {
  const user = await getAuth0User(event);
  if (!user) {
    return createResponse({
      error: 'did not find registered user'
    });
  }
  if (!staffCheck(user))
    return createResponse(
      {
        error: 'You are not allowed to perform this action'
      },
      401
    );
  const { username, repo, branch } = event.pathParameters;
  const state = JSON.parse(event.body).approved;
  const repoPath = `${username}/${repo}/${branch}`;
  const result = await updateProp(repoPath, username, 'type', state);
  if (result.error) {
    return createResponse(result, 503);
  }
  await notify({
    title: 'A repo was just approved',
    content: `
    ${
      user.name
    } just approved [${repoPath}](https://dev.v3.cogs.red/${repoPath})

    [Github](https://github.com/${username}/${repo}/tree/${branch})
    `,
    level: 'success'
  });
  return createResponse({
    results: `Repo ${repoPath} succesfully approved`
  });
};
