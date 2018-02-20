// Initializes the `github` service on path `/github`
const createService = require('./github.class.js');
const hooks = require('./github.hooks');

module.exports = function (app) {
  
  const paginate = app.get('paginate');

  const options = {
    name: 'github',
    paginate
  };

  // Initialize our service with any options it requires
  app.use('/github', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('github');

  service.hooks(hooks);
};
