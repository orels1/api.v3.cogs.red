const app = require('express')();
const router = require('express').Router();
const { body } = require('express-validator');
const { sanitizeBody } = require('express-validator');
const bodyParser = require('body-parser');
const Firestore = require('@google-cloud/firestore');
const cors = require('cors');
const pick = require('lodash/pick');
const { roleCheck, globalFlags, ownerCheck, json } = require('./middleware');
const { mapCollection } = require('./utils');
const { getItemsByParams, getItemByPath, updateCogByPath } = require('./db');

const firestore = new Firestore({
  projectId: 'starlit-channel-244200'
});

app.use(cors());
app.use(globalFlags);
app.use(json);
app.use(bodyParser.json());

app.use('/reports', router);

const REPORT_TYPES = ['api_abuse', 'malware', 'license'];

const log = async (content, id) =>
  await firestore.collection('logs').add({
    content: content,
    created: Date.now(),
    module: 'reports',
    resourceId: id
  });

router.post(
  '/:username/:repo/:branch/:cog',
  [
    body('comment')
      .trim()
      .escape()
  ],
  async (req, res) => {
    const ip = req.get('x-forwarded-for').split(',')[0];
    const { username, repo, branch, cog } = req.params;
    const path = `${username}/${repo}/${branch}/${cog}`;
    const existing = await firestore
      .collection('reports')
      .where('path', '==', path)
      .where('ip', '==', ip)
      .get();
    const canReport =
      !existing.size ||
      existing.docs.reduce((can, item) => {
        if (!item.data().stale) {
          can = false;
        }
        return can;
      }, true);
    if (!canReport) {
      return res.status(400).send({
        error: 'You already reported this cog'
      });
    }
    const { type, comment } = req.body;
    if (!REPORT_TYPES.includes(type)) {
      return res.status(400).send({
        error: 'Report type must be one of ' + REPORT_TYPES.join(', ')
      });
    }
    const timestamp = Date.now();
    const reportData = {
      path,
      authorName: username,
      repoName: repo,
      branchName: branch,
      cogName: cog,
      ip,
      type,
      comment,
      stale: false,
      seen: false,
      created: timestamp,
      updated: timestamp,
      seenBy: null,
      dismissedBy: null,
      qaNotified: false
    };
    console.log(reportData);
    try {
      await firestore.collection('reports').add(reportData);
      return res.send({
        path,
        type,
        comment,
        created: timestamp
      });
    } catch (e) {
      console.error(e);
      res.status(503).send({
        error: 'Could not create report'
      });
    }
  }
);

router.get('', roleCheck(['staff', 'qa']), async (req, res) => {
  const reports = await firestore
    .collection('reports')
    .orderBy('created', 'desc')
    .get();
  const results = mapCollection(reports);
  const filtered = reportsStaffDataFilter(results);
  res.send({
    count: results.length,
    results: filtered
  });
});

const reportsUserDataFilter = reports =>
  reports.map(r => ({
    ...pick(r, ['path', 'type', 'created', 'updated'])
  }));

const reportsStaffDataFilter = reports =>
  reports.map(r => ({
    ...pick(r, [
      'id',
      'path',
      'comment',
      'type',
      'stale',
      'seenBy',
      'seen',
      'dismissedBy',
      'created',
      'updated'
    ])
  }));

const isUserCheck = req => req.owner && !req.qa && !req.staff && !req.admin;

router.get('/:username', ownerCheck, async (req, res) => {
  const { username } = req.params;
  let query = firestore
    .collection('reports')
    .where('authorName', '==', username);
  // filter out not seen and stale reports for non-qa+ owners
  const isUser = isUserCheck(req);
  if (isUser) {
    query = query.where('seen', '==', true).where('stale', '==', false);
  }
  const reports = await query.orderBy('created', 'desc').get();
  let results = mapCollection(reports);
  if (isUser) {
    results = reportsUserDataFilter(results);
  } else {
    results = reportsStaffDataFilter(results);
  }
  res.send({
    count: results.length,
    results
  });
});

router.post('/:id/stale', roleCheck(['staff', 'qa']), async (req, res) => {
  const { id } = req.params;
  const existing = await firestore
    .collection('reports')
    .doc(id)
    .get();
  if (!existing.exists) {
    res.status(400).send({
      error: 'Report does not exist'
    });
  }
  const { stale } = req.body;
  const existingData = existing.data();
  const updatedReport = {
    ...existingData,
    id: id,
    stale,
    updated: Date.now(),
    seen: true,
    seenBy: existingData.seenBy || req.user.data.nickname,
    dismissedBy: req.user.data.nickname
  };
  let logContent = `${req.user.data.nickname} marked report as stale`;
  if (!stale) {
    logContent = `${req.user.data.nickname} dismissed stale report marking made by ${existingData.dismissedBy}`;
  }
  try {
    const saved = await firestore
      .collection('reports')
      .doc(id)
      .update(updatedReport);
    res.send({
      ...pick(updatedReport, [
        'id',
        'path',
        'stale',
        'seen',
        'seenBy',
        'updated',
        'dismissedBy'
      ])
    });
    await log(logContent, id);
  } catch (e) {
    console.error(e);
    res.status(503).send({
      error: 'Could not mark report as stale'
    });
  }
});

router.post('/:id/seen', roleCheck(['staff', 'qa']), async (req, res) => {
  const { id } = req.params;
  const existing = await firestore
    .collection('reports')
    .doc(id)
    .get();
  if (!existing.exists) {
    res.status(400).send({
      error: 'Report does not exist'
    });
  }
  const existingData = existing.data();
  const { seen } = req.body;
  const updatedReport = {
    ...existingData,
    id,
    seen,
    updated: Date.now(),
    seenBy: req.user.data.nickname
  };
  let logContent = `${req.user.data.nickname} marked report as seen`;
  if (!seen) {
    updatedReport.seenBy = null;
    logContent = `${req.user.data.nickname} dismissed seen report marking made by ${existingData.seenBy}`;
  }
  try {
    const saved = await firestore
      .collection('reports')
      .doc(id)
      .update(updatedReport);
    res.send({
      ...pick(updatedReport, ['id', 'path', 'seen', 'updated', 'seenBy'])
    });
    await log(logContent, id);
  } catch (e) {
    console.error(e);
    res.status(503).send({
      error: 'Could not mark report as stale'
    });
  }
});

module.exports = app;
