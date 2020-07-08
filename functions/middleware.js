const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');
const Firestore = require('@google-cloud/firestore');
const functions = require('firebase-functions');
const { get, isEmpty } = require('lodash');

const AUTH0_CLIENT_ID = functions.config().auth0.client_id;
const AUTH0_AUDIENCE = functions.config().auth0.audience;
const AUTH0_DOMAIN = functions.config().auth0.domain;
const AUTH0_API_CLIENT_ID = functions.config().auth0.api_client_id;
const AUTH0_API_CLIENT_SECRET = functions.config().auth0.api_client_secret;

const PUBLIC_KEY = `
-----BEGIN CERTIFICATE-----
MIIC9zCCAd+gAwIBAgIJekm7Q9qo2VjVMA0GCSqGSIb3DQEBCwUAMBkxFzAVBgNV
BAMTDmNvZ3MuYXV0aDAuY29tMB4XDTE4MDkxOTIyNDgxNFoXDTMyMDUyODIyNDgx
NFowGTEXMBUGA1UEAxMOY29ncy5hdXRoMC5jb20wggEiMA0GCSqGSIb3DQEBAQUA
A4IBDwAwggEKAoIBAQDWWiVlOQx2Mvm4KBSiZJALebFntJ6El19WrNLiVSAlQafG
dZRKJjuMGdS+L4wZbKD2hmSIebkXXgz1B5An/pQe3OJw62nhD95yqDk1yLldSQ9m
AODrcqIRRCBwve4IPE07VXqzHUYu6pMO6Hnpp9uk6TdkGsnwYUVWKFUYf6fgV1tg
toEjhI8sxH4XKS1HrZ0pJeYrDMFYy5lqCopuc/c35+PQGu/AdOlZN8ni2cpWMgT+
b5t5l6T6URswqE9rdF7KowPolmHKAmkHiwcfpf2G2HsBllj1LZWq5nQ87JGt+hoE
cjTj/pNZOf05MqFvkSnfQDRxkZNzXC05khR80UgxAgMBAAGjQjBAMA8GA1UdEwEB
/wQFMAMBAf8wHQYDVR0OBBYEFJM1r4mVvAVzjSBa0LhB7UBlay+2MA4GA1UdDwEB
/wQEAwIChDANBgkqhkiG9w0BAQsFAAOCAQEAcl+EcskwKt+GVaWFs+D7GKTlQJpV
yA6k2RkL0h1EIp97cR+/BfM0Sv6XVnQ/gEBxqio9Eo/U7yF3Ywur0PfnZ0GtOM7Z
1ASndvJWFehZdL0Y1SABDuKCjZwr5mppi3+qUSnSckIDAj3P1RFdMMjxPRAJHXti
nVAvYm4vj2xBDhGMPo5K+H9FVCIo0mOpBtWaZ+ybX6YVcnUR4/WBTrUp6JT/0E7k
4yjoF+sHtg8OlK63YrPXN0m1OlA0/h7wkldYrHj/7rQGJlDf7/Qcw/bCyeD47QaO
k0UzoAxSiKgpAUN75shZ4B6sHQmEo+2TNaj/zcboYSsuJeu5gGOl3Nj4aQ==
-----END CERTIFICATE-----
`.trim();

const firestore = new Firestore({
  projectId: 'starlit-channel-244200'
});

exports.json = (req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
};

exports.globalFlags = (req, res, next) => {
  const { showUnapproved, showHidden, version } = req.query;
  const anon = !req.get('Authorization');
  req.flags = {
    showUnapproved: Boolean(showUnapproved),
    showHidden: Boolean(showHidden),
    version,
    anon
  };
  next();
};

const verify = (...args) =>
  new Promise((resolve, reject) => {
    jwt.verify(...args, (verifyError, decoded) => {
      if (verifyError) {
        return reject(verifyError);
      }
      return resolve(decoded);
    });
  });

const injectAuth0 = async (req, res, next) => {
  const tokenHeader = req.get('authorization');
  if (!tokenHeader || !tokenHeader.length) {
    return res.status(401).send({
      error: 'Unauthorized'
    });
  }

  const token = tokenHeader.split(' ')[1];
  const options = {
    audience: AUTH0_AUDIENCE,
    issuer: `https://${AUTH0_DOMAIN}/`
  };

  try {
    const decoded = await verify(token, PUBLIC_KEY, options);
    req.user = decoded;
  } catch (e) {
    console.error(e);
    return res.end({
      error: 'Unauthorized'
    });
  }

  return next();
};

// const checkJwt = jwt({
//   secret: jwksRsa.expressJwtSecret({
//     cache: false,
//     rateLimit: false,
//     jwksUri: `https://${options.domain}/.well-known/jwks.json`
//   }),

//   audience: options.audience,
//   issuer: `https://${options.domain}/`,
//   algorithm: ['RSA256']
// });

// const injectAuth0 = async (req, res, next) => {
//   const tokenHeader = req.get('authorization');
//   if (!tokenHeader || !tokenHeader.length) {
//     return res.status(401).send({
//       error: 'Unauthorized'
//     });
//   }

//   const token = tokenHeader.split(' ')[1];
//   const resp = await fetch(`https://${AUTH0_DOMAIN}/userinfo`, {
//     headers: {
//       authorization: tokenHeader
//     }
//   });
//   const userInfo = await resp.json();
//   req.user = userInfo;

//   return next();
// };

exports.injectAuth0 = injectAuth0;

const injectUserInfo = async (req, res, next) => {
  try {
    const tokenData = await firestore
      .collection('config')
      .doc('auth0Token')
      .get();
    const { value: auth0Token } = tokenData.data();
    req.auth0Token = auth0Token;
    const { sub: userId } = req.user;
    const resp = await fetch(
      `https://cogs.auth0.com/api/v2/users?q=user_id:"${userId}"`,
      {
        headers: {
          Authorization: `Bearer ${auth0Token}`
        }
      }
    );
    const json = await resp.json();
    if (!json.length) {
      return res.status(401).send({
        error: 'User not found'
      });
    }
    const userData = json[0];
    req.user.data = userData;
    const roles = get(userData, 'app_metadata.roles', ['user']);
    req.user.roles = roles;
    req.user.meta = get(userData, 'app_metadata', { roles, admin: false });
    req.staff = roles.includes('staff');
    req.qa = roles.includes('qa');
    req.admin = req.user.meta.admin;
    req.user.ghToken = userData.identities.find(
      i => i.connection === 'github'
    ).access_token;
    return next();
  } catch (e) {
    console.error(e);
    res.status(503).send({
      error: e.message
    });
  }
};

exports.injectUserInfo = injectUserInfo;

exports.roleCheck = (role = 'staff') => [
  injectAuth0,
  injectUserInfo,
  (req, res, next) => {
    if (req.admin || req.owner) {
      return next();
    }
    let pass = false;
    if (Array.isArray(role)) {
      role.forEach(roleName => {
        if (req.user.roles.includes(roleName)) {
          pass = true;
        }
      });
    } else {
      if (req[role] || req.user.roles.includes(role)) {
        pass = true;
      }
    }
    if (pass) {
      return next();
    }
    return res.status(401).send({
      error: 'Access denied'
    });
  }
];

const accessCheck = (req, res, next) => {
  let username = null;
  if (req.params && !isEmpty(req.params)) {
    username = req.params.username;
  }
  if (req.body && !isEmpty(req.body)) {
    username = req.body.username || username;
  }
  if (!username) {
    return res.status(400).send({
      error: 'No username supplied'
    });
  }

  if (req.user.data.nickname !== username && !req.staff && !req.qa) {
    return res.status(401).send({
      error: 'Access denied'
    });
  }
  req.owner = true;
  return next();
};

exports.accessCheck = accessCheck;

const cors = (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
};

exports.cors = cors;

exports.ownerCheck = [injectAuth0, injectUserInfo, accessCheck];
