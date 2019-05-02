const { reduce } = require('lodash');
const {
  createResponse,
  userCheck,
  getAuth0User,
  staffCheck
} = require('./utils');
const {
  removeRepoByPath,
  hide: hideRepo,
  approve: approveRepo
} = require('./repos');
const {
  getCogsInRepoMethod,
  removeCogsByRepo,
  hide: hideCog,
  approve: approveCog,
  getMethod
} = require('./cogs');

exports.getUserMeta = async event => {
  const user = await getAuth0User(event);
  if (!user)
    return createResponse({
      error: 'did not find registered user'
    });
  return createResponse({
    ...user.app_metadata
  });
};

exports.removeRepo = async event => {
  const repoRemoveResults = await removeRepoByPath(event);
  const cogsRemoveResults = await removeCogsByRepo(event);
  if (
    repoRemoveResults.statusCode !== 200 ||
    cogsRemoveResults.statusCode !== 200
  ) {
    return repoRemoveResults;
  } else {
    return createResponse({});
  }
};

exports.hideRepo = async event => {
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
  const repoResult = await hideRepo(repoPath, user.name, state);
  if (repoResult.error) {
    return createResponse(repoResult);
  }
  const cogsList = await getCogsInRepoMethod(username, repo, branch, {});
  const cogsResults = await Promise.all(
    cogsList.Items.map(c =>
      hideCog(`${username}/${repo}/${c.name}/${branch}`, username, state)
    )
  );
  const failedCogs = cogsResults.filter(i => i && i.error);
  if (failedCogs.length) {
    return createResponse(
      {
        error: failedCogs.map(i => i.error).join('\n'),
        error_details: failedCogs.map(i => i.error_details).join('\n\n')
      },
      503
    );
  }
  return createResponse({
    result: `Successfully hid ${cogsList.Items.length} cogs`
  });
};

exports.approveRepo = async event => {
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
  const repoResult = await approveRepo(repoPath, username, state);
  if (repoResult.error) {
    return createResponse(repoResult);
  }
  const cogsList = await getCogsInRepoMethod(username, repo, branch, {});
  const cogsResults = await Promise.all(
    cogsList.Items.map(c =>
      approveCog(`${username}/${repo}/${c.name}/${branch}`, username, state)
    )
  );
  console.log(cogsResults);
  const failedCogs = cogsResults.filter(i => i && i.error);
  if (failedCogs.length) {
    return createResponse(
      {
        error: failedCogs.map(i => i.error).join('\n'),
        error_details: failedCogs.map(i => i.error_details).join('\n\n')
      },
      503
    );
  }
  return createResponse({
    result: `Successfully ${state} ${cogsList.Items.length} cogs`
  });
};

exports.getReportsPerRepo = async event => {
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
  const cogs = await getMethod({}, {});
  if (!cogs.Count) {
    return createResponse({
      result: {}
    });
  }
  const reportsByRepos = reduce(
    cogs.Items,
    (result, cog) => {
      if (!result[cog.repo.name]) {
        result[cog.repo.name] = 0;
      }
      result[cog.repo.name] += cog.reports.length;
      return result;
    },
    {}
  );
  return createResponse({
    result: reportsByRepos
  });
};
