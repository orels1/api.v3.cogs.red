const app = require('express')();
const router = require('express').Router();
const cors = require('cors');
const fetch = require('node-fetch');
const functions = require('firebase-functions');
const {
  injectAuth0,
  injectUserInfo,
  roleCheck,
  json
} = require('./middleware');

app.use(cors());
app.use(json);

app.use('/users', router);

router.get('/', roleCheck('staff'), async (req, res) => {
  const resp = await fetch('https://cogs.auth0.com/api/v2/users', {
    headers: {
      Authorization: `Bearer ${req.auth0Token}`
    }
  });
  const json = await resp.json();
  const enhanced = json.map(u => ({
    ...u,
    app_metadata: u.app_metadata || {}
  }));
  res.send({
    count: enhanced.length,
    results: enhanced
  });
});

// `current` urls are "special"
router.get('/current/meta', injectAuth0, injectUserInfo, (req, res) => {
  res.send(req.user.meta);
});

router.get('/:userID', roleCheck('staff'), async (req, res) => {
  const { userID } = req.params;
  const resp = await fetch(`https://cogs.auth0.com/api/v2/users/${userID}`, {
    headers: {
      Authorization: `Bearer ${req.auth0Token}`,
      'Content-Type': 'application/json'
    }
  });
  const json = await resp.json();
  res.send(json);
});

router.get('/:userID/meta', roleCheck('staff'), async (req, res) => {
  const { userID } = req.params;
  const resp = await fetch(`https://cogs.auth0.com/api/v2/users/${userID}`, {
    headers: {
      Authorization: `Bearer ${req.auth0Token}`,
      'Content-Type': 'application/json'
    }
  });
  const json = await resp.json();
  res.send(json.app_metadata);
});

router.patch('/:userID/meta', roleCheck('staff'), async (req, res) => {
  const { userID } = req.params;
  const resp = await fetch(`https://cogs.auth0.com/api/v2/users/${userID}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${req.auth0Token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(req.body)
  });
  const json = await resp.json();
  res.send(json);
});

module.exports = app;
