const { createResponse, userCheck, getAuth0User } = require('./utils');
const { removeRepoByPath } = require('./repos');
const { removeCogsByRepo } = require('./cogs');

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
