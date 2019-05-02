const fetch = require('node-fetch');
const { getAuth0User, adminCheck, createResponse } = require('./utils');
const { getAuth0ManagementToken } = require('./auth');

exports.get = async event => {
  const user = await getAuth0User(event);
  if (!user) {
    return createResponse({
      error: 'did not find registered user'
    });
  }
  if (!adminCheck(user, event))
    return createResponse(
      {
        error: 'You are not allowed to perform this action'
      },
      401
    );
  const token = await getAuth0ManagementToken();
  const resp = await fetch(`https://cogs.auth0.com/api/v2/users`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  const json = await resp.json();
  return createResponse({
    results: json
  });
};

exports.updateUser = async event => {
  const user = await getAuth0User(event);
  if (!user) {
    return createResponse({
      error: 'did not find registered user'
    });
  }
  if (!adminCheck(user, event))
    return createResponse(
      {
        error: 'You are not allowed to perform this action'
      },
      401
    );
  const token = await getAuth0ManagementToken();
  const { id } = event.pathParameters;
  const data = JSON.parse(event.body);
  const resp = await fetch(`https://cogs.auth0.com/api/v2/users/${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  const json = await resp.json();
  return createResponse({
    results: json
  });
};
