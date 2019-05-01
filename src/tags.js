const { createResponse } = require('./utils');

exports.getTop = async () => {
  return createResponse({
    results: []
  });
};
