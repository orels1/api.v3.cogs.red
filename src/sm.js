// Unapologetically stolen from https://github.com/SanderKnape/aws-secrets-manager-custom-secret/blob/master/index.js
const AWS = require('aws-sdk');
const fetch = require('node-fetch');
const client = new AWS.SecretsManager();
const { rotate } = require('./auth');

exports.handler = (event, context) => {
  const step = event.Step;
  const token = event.ClientRequestToken;
  const arn = event.SecretId;

  switch (step) {
    case 'createSecret':
      create_secret(client, arn, token);
      break;
    case 'setSecret':
      set_secret(client, arn);
      break;
    case 'testSecret':
      test_secret(client, arn);
      break;
    case 'finishSecret':
      finish_secret(client, arn, token);
      break;
  }
};

async function create_secret(client, arn, token) {
  params = {
    SecretId: arn,
    VersionStage: 'AWSCURRENT'
  };

  const { access_token } = await rotate();

  params = {
    SecretId: arn,
    SecretString: JSON.stringify({
      token: access_token
    }),
    VersionStages: ['AWSPENDING'],
    ClientRequestToken: token
  };

  data = await client.putSecretValue(params).promise();

  console.log('PUT PENDING SECRET');
  return;
}

async function set_secret(client, arn) {
  console.log('SET_SECRET STEP PASS');
  return;
}

async function test_secret(client, arn) {
  const params = {
    SecretId: arn,
    VersionStage: 'AWSPENDING'
  };

  const data = await client.getSecretValue(params).promise();
  const { token } = JSON.parse(data['SecretString']);

  const resp = await fetch('https://cogs.auth0.com/api/v2/users', {
    headers: {
      authorization: `Bearer ${token}`
    }
  });
  if (resp.ok) {
    console.log('TEST OK');
  }
  return;
}

async function finish_secret(client, arn, token) {
  let params = {
    SecretId: arn,
    VersionStage: 'AWSCURRENT'
  };

  let data = await client.getSecretValue(params).promise();
  const version_id = data['VersionId'];

  params = {
    SecretId: arn,
    VersionStage: 'AWSCURRENT',
    MoveToVersionId: token,
    RemoveFromVersionId: version_id
  };

  data = await client.updateSecretVersionStage(params).promise();

  console.log('PROMOTED PENDING SECRET TO CURRENT');
}
