const crypto = require('crypto');
const { concat, filter, reduce } = require('lodash');
const {
  createResponse,
  userCheck,
  getIdToken,
  createOctokit
} = require('./utils');
const { notify } = require('./discord');
const { remove: removeCog } = require('./cogs');
const { save } = require('./parser');

const APP_GH_TOKEN = process.env.GITHUB_TOKEN;
const HOOK_SECRET = process.env.HOOK_SECRET;

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
  const { ghToken, user, auth0User } = idData;
  if (!userCheck(user, event, true))
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
  // create github webhook
  const body = JSON.parse(event.body);
  const { username, repo, branch } = body;
  const hookUrl = `http://cogs.eu.eu.ngrok.io/github/hooks/${username}/${repo}/${branch}`;
  const client = createOctokit(ghToken);
  // check if hook exists
  const { data: existing } = await client.repos.getHooks({
    owner: username,
    repo
  });
  if (existing.find(h => h.config.url === hookUrl)) {
    // parse and save the repo
    await save(auth0User, { username, repo, branch });
    return createResponse({
      results: existing.find(h => h.config.url === hookUrl)
    });
  }
  // create a new hook
  const { data } = await client.repos.createHook({
    name: 'web',
    owner: username,
    repo,
    config: {
      url: hookUrl,
      content_type: 'json',
      secret: HOOK_SECRET
    },
    events: ['push']
  });
  // parse and save the repo
  await save(auth0User, { username, repo, branch });
  return createResponse({
    results: data
  });
};

exports.webhook = async event => {
  const { body, headers } = event;
  const { username, repo, branch } = event.pathParameters;
  const hmac = crypto.createHmac('sha1', HOOK_SECRET);
  hmac.update(body);
  const ourHash = hmac.digest('hex');
  if (`sha1=${ourHash}` !== headers['X-Hub-Signature']) {
    return createResponse(
      {
        error: 'Hash mismatch'
      },
      401
    );
  }
  const parsedBody = JSON.parse(body);
  const user = `github|${parsedBody.sender.id}`;

  // initial webhook creation
  if (headers['X-GitHub-Event'] === 'ping') {
    // save the repo first
    await save(user, {
      branch: branch,
      repo: repo,
      username: username,
    });
    await notify({
      title: 'A new repo was added',
      content: `Take a look at [this](https://dev.v3.cogs.red/${username}/${repo}/${branch})`
    });
    return createResponse({});
  }

  const parsed = {
    branch: parsedBody.ref.match(/[^/]+/g)[2],
    repo: parsedBody.repository.name,
    username: parsedBody.repository.owner.login,
    author: parsedBody.commits[0].author.username,
    modified: reduce(
      parsedBody.commits,
      (result, val) => result.concat(val.modified),
      []
    ),
    added: reduce(
      parsedBody.commits,
      (result, val) => result.concat(val.added),
      []
    ),
    removed: reduce(
      parsedBody.commits,
      (result, val) => result.concat(val.removed),
      []
    )
  };

  // check if it is the correct repo/branch
  if (
    branch !== parsed.branch ||
    repo !== parsed.repo ||
    username !== parsed.username
  ) {
    return createResponse({});
  }

  // check if any jsons were actually changed
  const changes = concat([], parsed.modified, parsed.added, parsed.removed);
  const changedJsons = filter(changes, i => i.includes('info.json'));
  if (changedJsons.length) {
    // remove the cogs we don't need anymore
    const removedCogs = filter(parsed.removed, i =>
      i.includes('info.json')
    ).map(path => path.substr(0, path.indexOf('/')));
    await Promise.all(
      removedCogs.map(c =>
        removeCog(
          `${parsed.username}/${parsed.repo}/${c}/${parsed.branch}`,
          parsed.author
        )
      )
    );

    return await save(user, {
      branch: parsed.branch,
      repo: parsed.repo,
      username: parsed.username,
    });
  }
  return createResponse({});
};
