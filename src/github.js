const crypto = require('crypto');
const {
  createResponse,
  userCheck,
  getIdToken,
  createOctokit
} = require('./utils');
const { concat, filter } = require('lodash');

const APP_GH_TOKEN = process.env.GITHUB_TOKEN;
const HOOK_SECRET = 'red-portal-v3';

exports.getRepos = async event => {
  const idData = await getIdToken(event);
  if (!idData)
    return createResponse({
      error: 'did not find registered user'
    });
  const { ghToken, user } = idData;
  if (!userCheck(user, event))
    return createResponse(
      {
        error:
          'You are trying to perform an operation on behalf of different user!'
      },
      401
    );
  const {
    pathParameters: { username }
  } = event;
  const { data } = await createOctokit(ghToken).repos.getForUser({
    username,
    sort: 'updated',
    per_page: 100
  });
  return createResponse({
    results: data.map(r => ({
      name: r.name,
      full_name: r.full_name,
      default_branch: r.default_branch
    }))
  });
};

exports.getBranches = async event => {
  const idData = await getIdToken(event);
  if (!idData)
    return createResponse({
      error: 'did not find registered user'
    });
  const { ghToken, user } = idData;
  if (!userCheck(user, event))
    return createResponse(
      {
        error:
          'You are trying to perform an operation on behalf of different user!'
      },
      401
    );
  const { username, repo } = event.pathParameters;
  const { data } = await createOctokit(ghToken).repos.getBranches({
    owner: username,
    repo,
    per_page: 100
  });
  return createResponse({
    results: data
  });
};

exports.getGithubHooks = async event => {
  const { username, repo } = event.pathParameters;
  const { data } = await createOctokit(APP_GH_TOKEN).repos.getHooks({
    owner: username,
    repo
  });
  return createResponse({
    results: data
  });
};

exports.createGithubHook = async event => {
  const idData = await getIdToken(event);
  if (!idData)
    return createResponse({
      error: 'did not find registered user'
    });
  const { ghToken, user } = idData;
  if (!userCheck(user, event))
    return createResponse(
      {
        error:
          'You are trying to perform an operation on behalf of different user!'
      },
      401
    );
  if (!event.body)
    return createResponse(
      {
        error: 'Should provide username, repo and branch in body'
      },
      401
    );
  const body = JSON.parse(event.body);
  const { username, repo, branch } = body;
  const { data } = await createOctokit(ghToken).repos.createHook({
    name: 'web',
    owner: username,
    repo,
    config: {
      url: `http://d1ae6a26.ngrok.io/hookTest/${username}/${repo}/${branch}`,
      content_type: 'json',
      secret: HOOK_SECRET
    },
    events: ['push']
  });
  return createResponse({
    results: data
  });
};

exports.hookTest = async event => {
  const { body, headers } = event;
  const { username, repo, branch } = event.pathParameters;
  const hmac = crypto.createHmac('sha1', HOOK_SECRET);
  hmac.update(body);
  const ourHash = hmac.digest('hex');
  console.log(
    'hash validated',
    `sha1=${ourHash}` === headers['X-Hub-Signature']
  );
  const parsedBody = JSON.parse(body);
  const parsed = {
    branch: parsedBody.ref.match(/[^/]+/g)[2],
    repo: parsedBody.repository.name,
    username: parsedBody.repository.owner.login,
    author: parsedBody.commits[0].author.username,
    modified: parsedBody.commits[0].modified,
    added: parsedBody.commits[0].added,
    removed: parsedBody.commits[0].removed
  };

  // check if it is the correct repo/branch
  if (
    branch === parsed.branch &&
    repo === parsed.repo &&
    username === parsed.username
  ) {
    console.log('legit push!');
  } else {
    console.log('unknown push');
  }

  // check if any jsons were actually changed
  const changes = concat([], parsed.modified, parsed.added, parsed.removed);
  const changedJsons = filter(changes, i => i.includes('info.json'));
  if (changedJsons.length) {
    console.log('info.jsons changed, re-parsing!');
  }

  console.log(parsed);
  return createResponse({});
};
