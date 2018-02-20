const { authenticate } = require('@feathersjs/authentication').hooks;
const validator = require('../../hooks/validator');

module.exports = {
  before: {
    all: [],
    find: [],
    get: [],
    create: [ authenticate('jwt'), validator() ],
    update: [ authenticate('jwt') ],
    patch: [ authenticate('jwt') ],
    remove: [ authenticate('jwt') ]
  },

  after: {
    all: [],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: []
  },

  error: {
    all: [],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: []
  }
};
