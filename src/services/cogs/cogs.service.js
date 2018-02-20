// Initializes the `cogs` service on path `/cogs`
const createService = require('feathers-nedb');
const createModel = require('../../models/cogs.model');
const hooks = require('./cogs.hooks');

module.exports = function (app) {
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'cogs',
    Model,
    paginate
  };

  // Initialize our service with any options it requires
  app.use('/cogs', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('cogs');

  service.hooks(hooks);
};
