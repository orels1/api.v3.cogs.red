const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const AWS = require('aws-sdk');

const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID;
const AUTH0_CLIENT_PUBLIC_KEY = process.env.AUTH0_CLIENT_PUBLIC_KEY;
const AUTH0_API_CLIENT_ID = process.env.AUTH0_API_CLIENT_ID;
const AUTH0_API_CLIENT_SECRET = process.env.AUTH0_API_CLIENT_SECRET;

const SM_ENDPOINT = 'https://secretsmanager.us-east-1.amazonaws.com';
const SM_AUTH0_SECRET = 'Auth0';
const client = new AWS.SecretsManager({
  endpoint: SM_ENDPOINT,
  region: 'us-east-1'
});

// Policy helper function
const generatePolicy = (principalId, effect, resource) => {
  const authResponse = {};
  authResponse.principalId = principalId;
  if (effect && resource) {
    const policyDocument = {};
    policyDocument.Version = '2012-10-17';
    policyDocument.Statement = [];
    const statementOne = {};
    statementOne.Action = 'execute-api:Invoke';
    statementOne.Effect = effect;
    statementOne.Resource = resource;
    policyDocument.Statement[0] = statementOne;
    authResponse.policyDocument = policyDocument;
  }
  return authResponse;
};

module.exports.authorize = (event, context, callback) => {
  if (!event.authorizationToken) {
    return callback('Unauthorized');
  }

  const tokenParts = event.authorizationToken.split(' ');
  const tokenValue = tokenParts[1];

  if (!(tokenParts[0].toLowerCase() === 'bearer' && tokenValue)) {
    // no auth token!
    return callback('Unauthorized');
  }
  const options = {
    audience: AUTH0_CLIENT_ID
  };

  try {
    jwt.verify(
      tokenValue,
      AUTH0_CLIENT_PUBLIC_KEY,
      options,
      (verifyError, decoded) => {
        if (verifyError) {
          console.log('verifyError', verifyError);
          // 401 Unauthorized
          console.log(`Token invalid. ${verifyError}`);
          return callback('Unauthorized');
        }

        return callback(
          null,
          generatePolicy(decoded.sub, 'Allow', event.methodArn)
        );
      }
    );
  } catch (err) {
    console.log('catch error. Invalid token', err);
    return callback('Unauthorized');
  }
};

exports.rotate = async () => {
  const resp = await fetch('https://cogs.auth0.com/oauth/token', {
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
  });
  return resp.json();
};

exports.getAuth0ManagementToken = async () => {
  const encoded = await client
    .getSecretValue({ SecretId: SM_AUTH0_SECRET })
    .promise();
  const { token } = JSON.parse(encoded.SecretString);
  return token;
};
