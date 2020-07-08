const app = require('express')();
const router = require('express').Router();
const Firestore = require('@google-cloud/firestore');
const merge = require('lodash/merge');
const cors = require('cors');
const bodyParser = require('body-parser');
const { dummyData } = require('./mocks');
const { globalFlags, json, ownerCheck } = require('./middleware');
const { flagsFilter, mapCollection } = require('./utils');
const { getItemsByParams, getItemByPath, updateRepoByPath } = require('./db');

const firestore = new Firestore({
  projectId: 'starlit-channel-244200'
});

app.use(cors());
app.use(globalFlags);
app.use(json);
app.use(bodyParser.json());

app.use('/repos', router);

// All repos
router.get('/', async (req, res) => {
  const results = await getItemsByParams(req, 'repos');
  res.send({
    count: results.length,
    results
  });
});

// All repos by author
router.get('/:username', async (req, res) => {
  const { username } = req.params;
  const results = await getItemsByParams(req, 'repos', username);
  res.send({
    count: results.length,
    results
  });
});

// All repos by... repo(?) - different branches
router.get('/:username/:repoName', async (req, res) => {
  const { username, repoName, repoBranch } = req.params;
  const results = await getItemsByParams(req, 'repos', username, repoName);
  res.send({
    count: results.length,
    results
  });
});

// One repo
router.get('/:username/:repoName/:repoBranch', async (req, res) => {
  const { username, repoName, repoBranch } = req.params;
  const results = await getItemsByParams(req, 'repos', username, repoName);
  let repo = {};
  if (repoBranch === '___') {
    repo = results.find(r => r.defaultBranch === 'true');
  } else {
    repo = results.find(r => r.branch === repoBranch);
  }
  res.send(repo);
});

router.patch(
  '/:username/:repoName/:repoBranch/hide',
  ownerCheck,
  async (req, res) => {
    const { state } = req.body;
    const parsedState = Boolean(state);
    const repoPath = `${username}/${repoName}/${repoBranch}`;
    const updated = await updateRepoByPath(repoPath, {
      hidden: parsedState
    });
    if (!updated) {
      return res.status(400).send({
        error: 'Repo does not exist'
      });
    }
    return res.send(updated);
  }
);

exports.repos = app;
