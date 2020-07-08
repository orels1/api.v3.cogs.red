const app = require('express')();
const router = require('express').Router();
const bodyParser = require('body-parser');
const cors = require('cors');
const crypto = require('crypto');
const { concat, filter, reduce } = require('lodash');
const Octokit = require('@octokit/rest');
const functions = require('firebase-functions');
const { ownerCheck } = require('./middleware');
const { save } = require('./parser');

const Firestore = require('@google-cloud/firestore');
const firestore = new Firestore({
  projectId: 'starlit-channel-244200'
});

const GH_TOKEN = process.env.GH_TOKEN;

const createOctokit = token =>
  Octokit({
    userAgent: 'cogs.red backend v3',
    auth: token ? token : GH_TOKEN
  });

app.use(bodyParser.json());
app.use(cors());

app.use('/github', router);

router.get('/info/:username', ownerCheck, async (req, res) => {
  const { ghToken: token } = req.user;
  const { username } = req.params;
  const { data } = await createOctokit(token).repos.listForUser({
    username,
    sort: 'updated',
    per_page: 100
  });
  res.send({
    results: data.map(r => ({
      name: r.name,
      full_name: r.full_name,
      default_branch: r.default_branch
    }))
  });
});

router.get('/info/:username/:repo/branches', ownerCheck, async (req, res) => {
  const { ghToken: token } = req.user;
  const { repo, username } = req.params;
  const { data } = await createOctokit(token).repos.listBranches({
    owner: username,
    repo,
    per_page: 100
  });
  res.send({
    results: data
  });
});

router.get('/info/:username/:repo/hooks', ownerCheck, async (req, res) => {
  const { ghToken: token } = req.user;
  const { repo, username } = req.params;
  const { data } = await createOctokit(token).repos.listHooks({
    owner: username,
    repo
  });
  res.send({
    results: data
  });
});

router.post('/hooks', ownerCheck, async (req, res) => {
  const { ghToken: token } = req.user;
  const { username, repo, branch } = req.body;
  const hookUrl = `https://api.dev.cogs.red/hooks/${username}/${repo}/${branch}`;
  const client = createOctokit(token);

  // check if the hook exists and save the repo if so
  const { data: existing } = await client.repos.listHooks({
    owner: username,
    repo
  });
  if (existing.find(h => h.config.url === hookUrl)) {
    console.log('saving repo in existing', username, repo, branch);
    await save(username, repo, branch, token);
    res.send({
      results: existing.find(h => h.config.url === hookUrl)
    });
    return;
  }

  const { data } = await client.repos.createHook({
    name: 'web',
    owner: username,
    repo,
    config: {
      url: hookUrl,
      content_type: 'json',
      secret: functions.config().system.hook_secret
    },
    events: ['push']
  });
  await save(username, repo, branch, token);
  res.send({
    results: data
  });
});

const removeCog = async path => {
  const cog = await firestore
    .collection('cogs')
    .where('path', '==', path)
    .get();
  if (!cog.size) {
    return Promise.resolve();
  }
  const docID = cog.docs[0];
  return firestore
    .collection('cogs')
    .doc(docID)
    .delete();
};

router.post('/hooks/:username/:repo/:branch', async (req, res) => {
  const { username, repo, branch } = req.params;
  const ghEvent = req.get('X-GitHub-Event');
  const hmac = crypto.createHmac('sha1', functions.config().system.hook_secret);
  hmac.update(JSON.stringify(req.body));
  const ourHash = hmac.digest('hex');
  const theirHash = req.get('X-Hub-Signature');
  if (`sha1=${ourHash}` !== theirHash) {
    return res.status(401).send({
      error: 'Hash mismatch'
    });
  }
  const user = `github|${req.body.sender.id}`;
  if (ghEvent === 'ping') {
    // notify discord
    return res.send({});
  }

  const parsed = {
    branch: req.body.ref.match(/[^/]+/g)[2],
    repo: req.body.repository.name,
    username: req.body.repository.owner.login,
    author: req.body.commits[0].author.username,
    modified: reduce(
      req.body.commits,
      (result, val) => result.concat(val.modified),
      []
    ),
    added: reduce(
      req.body.commits,
      (result, val) => result.concat(val.added),
      []
    ),
    removed: reduce(
      req.body.commits,
      (result, val) => result.concat(val.removed),
      []
    )
  };

  if (
    branch !== parsed.branch ||
    repo !== parsed.repo ||
    username !== parsed.username
  ) {
    return res.send({});
  }

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

    await save(user, {
      branch: parsed.branch,
      repo: parsed.repo,
      username: parsed.username
    });
    res.send({});
  }
  return res.send({});
});

module.exports = app;
