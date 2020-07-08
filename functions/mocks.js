const app = require('express')();
const Firestore = require('@google-cloud/firestore');
const functions = require('firebase-functions');
const bodyParser = require('body-parser');
const { injectAuth0, injectUserInfo, roleCheck } = require('./middleware');

const firestore = new Firestore({
  projectId: 'starlit-channel-244200'
});

app.get('/', async (req, res) => {
  firestore.collection('repos').add({
    name: 'ORELS-Cogs',
    authorName: 'orels1',
    version: 2,
    type: 'unapproved'
  });
  res.end();
});

app.get('/update', async (req, res) => {
  firestore
    .collection('repos')
    .doc('DOTUi9jhNuS56eO7uGLg')
    .update({
      hidden: true
    });
  res.end();
});

app.get('/config', injectAuth0, injectUserInfo, (req, res) => {
  res.send({
    client_id: functions.config().auth0.client_id,
    domain: functions.config().auth0.domain
  });
});

app.post('/token', bodyParser.json(), async (req, res) => {
  const { token } = req.body;
  await firestore
    .collection('config')
    .doc('auth0Token')
    .set({
      value: token
    });
  res.send({
    success: true
  });
});

module.exports = app;
