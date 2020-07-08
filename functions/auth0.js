const fetch = require('node-fetch');
const Firestore = require('@google-cloud/firestore');
const functions = require('firebase-functions');

const AUTH0_API_CLIENT_ID = functions.config().auth0.api_client_id;
const AUTH0_API_CLIENT_SECRET = functions.config().auth0.api_client_secret;

exports.rotate = () => {
  const firestore = new Firestore({
    projectId: 'starlit-channel-244200'
  });

  return fetch('https://cogs.auth0.com/oauth/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      client_id: AUTH0_API_CLIENT_ID,
      client_secret: AUTH0_API_CLIENT_SECRET,
      audience: 'https://cogs.auth0.com/api/v2/',
      grant_type: 'client_credentials'
    })
  })
    .then(r => r.json())
    .then(json => {
      const { access_token: token } = json;
      return firestore
        .collection('config')
        .doc('auth0Token')
        .set({
          value: token
        });
    })
    .catch(e => console.error(e));
};
