const { merge } = require('lodash');

/**
 * Takes the filter object and returns a formatted FilterExpressions for merging
 * @param {Object} filter Object with attributes to filter by. Filtering is done by equality
 * @returns {Object} Containers FilterExpression, ExpressionsAttributeValues and ExpressionAttributeNames
 */
const genFilterExpression = filter => {
  if (!filter || !Object.keys(filter).length) return {};
  return merge(
    {},
    {
      FilterExpression: Object.entries(filter)
        .map(([key, val]) => `#${key} = :${key}`)
        .join(' AND ')
    },
    {
      ...(entries => {
        let results = {
          ExpressionAttributeValues: {},
          ExpressionAttributeNames: {}
        };
        entries.forEach(([key, val]) => {
          results.ExpressionAttributeValues[`:${key}`] = val;
          results.ExpressionAttributeNames[`#${key}`] = key;
        });
        return results;
      })(Object.entries(filter))
    }
  );
};

exports.genFilterExpression = genFilterExpression;

exports.queryByPath = (table, username, path, filter) =>
  merge(
    {},
    {
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
    },
    genFilterExpression(filter)
  );

exports.scan = (table, filter) =>
  merge(
    {},
    {
      TableName: table
    },
    genFilterExpression(filter)
  );

exports.createResponse = (body, statusCode = 200) => ({
  statusCode,
  body: JSON.stringify(body)
});
