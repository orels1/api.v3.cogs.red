const { sortBy, filter } = require('lodash/fp');
const { flow } = require('lodash');
const { createResponse } = require('./utils');
const { getMethod } = require('./cogs');

exports.search = async event => {
  const { Items: cogs } = await getMethod({}, {});
  if (!cogs.length) {
    return createResponse(
      {
        results: 'No cogs in the database'
      },
      404
    );
  }
  const { term } = event.pathParameters;
  const search = new RegExp(`(^|\\s)${term}`, 'gi');
  console.log(search);
  const processed = flow(
    filter(
      c =>
        search.test(c.path) ||
        search.test(c.description) ||
        search.test(c.short) ||
        search.test(c.tags.join(' '))
    )
  )(cogs);
  return createResponse({
    results: processed
  });
};
