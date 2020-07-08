const app = require('express')();
const router = require('express').Router();
const bodyParser = require('body-parser');
const Firestore = require('@google-cloud/firestore');
const cors = require('cors');
const merge = require('lodash/merge');
const { globalFlags, ownerCheck, json } = require('./middleware');
const { getItemsByParams, getItemByPath, updateCogByPath } = require('./db');

const firestore = new Firestore({
  projectId: 'starlit-channel-244200'
});

app.use(cors());
app.use(globalFlags);
app.use(json);
app.use(bodyParser.json());

app.use('/cogs', router);

// All cogs
router.get('/', async (req, res) => {
  const results = await getItemsByParams(req, 'cogs');
  res.send({
    count: results.length,
    results
  });
});

// All cogs by author
router.get('/:username', async (req, res) => {
  const { username } = req.params;
  const results = await getItemsByParams(req, 'cogs', username);
  res.send({
    count: results.length,
    results
  });
});

// All cogs by... repo & branch
router.get('/:username/:repoName/:repoBranch', async (req, res) => {
  const { username, repoName, repoBranch } = req.params;
  const results = await getItemsByParams(
    req,
    'cogs',
    username,
    repoName,
    repoBranch
  );
  res.send({
    count: results.length,
    results
  });
});

// One cog
router.get('/:username/:repoName/:repoBranch/:cogName', async (req, res) => {
  const { username, repoName, repoBranch, cogName } = req.params;
  const { showUnapproved, showHidden } = req.flags;
  const path = `${username}/${repoName}/${repoBranch}/${cogName}`;
  const cog = await getItemByPath(req, 'cogs', path);
  return res.send(cog);
});

router.patch(
  '/:username/:repoName/:repoBranch/:cogName/hide',
  ownerCheck,
  async (req, res) => {
    const { state } = req.body;
    const parsedState = Boolean(state);
    const cogPath = `${username}/${repoName}/${repoBranch}/${cogName}`;
    const updated = await updateCogByPath(cogPath, {
      hidden: parsedState
    });
    if (!updated) {
      return res.status(400).send({
        error: 'Cog does not exist'
      });
    }
    return res.send(updated);
  }
);

module.exports = app;
