// Initializes the `wh` service on path `/wh`
const createService = require('feathers-nedb');
const createModel = require('../../models/wh.model');
const hooks = require('./wh.hooks');

module.exports = function (app) {
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'wh',
    Model,
    paginate
  };

  // Initialize our service with any options it requires
  app.use('/wh', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('wh');

  service.hooks(hooks);
};
