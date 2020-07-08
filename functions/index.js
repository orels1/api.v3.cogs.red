const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { repos } = require('./repos');
const cogs = require('./cogs');
const mocks = require('./mocks');
const { parser } = require('./parser');
const github = require('./github');
const users = require('./users');
const panel = require('./panel');
const reports = require('./reports');

const { rotate } = require('./auth0');

admin.initializeApp();

exports.repos = functions.https.onRequest(repos);
exports.parser = functions.https.onRequest(parser);
exports.cogs = functions.https.onRequest(cogs);
exports.github = functions.https.onRequest(github);
exports.users = functions.https.onRequest(users);
exports.panel = functions.https.onRequest(panel);
exports.reports = functions.https.onRequest(reports);
exports.rotate = functions.pubsub.schedule('every 12 hours').onRun(rotate);
