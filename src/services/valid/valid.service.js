// Initializes the `valid` service on path `/valid`
const createService = require('./valid.class.js');
const hooks = require('./valid.hooks');

module.exports = function (app) {
  
  const paginate = app.get('paginate');

  const options = {
    name: 'valid',
    paginate
  };

  // Initialize our service with any options it requires
  app.use('/valid', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('valid');

  service.hooks(hooks);
};
