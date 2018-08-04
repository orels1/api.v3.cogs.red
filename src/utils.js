exports.queryByPath = (table, username, path) => ({
  TableName: table,
  KeyConditionExpression:
    'authorName = :username AND begins_with(#path, :path)',
  ExpressionAttributeNames: {
    '#path': 'path'
  },
  ExpressionAttributeValues: {
    ':username': username,
    ':path': path
  }
});

exports.createResponse = (body, statusCode = 200) => ({
  statusCode,
  body: JSON.stringify(body)
});
