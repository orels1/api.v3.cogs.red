const assert = require('assert');
const app = require('../../src/app');

describe('\'cogs\' service', () => {
  it('registered the service', () => {
    const service = app.service('cogs');

    assert.ok(service, 'Registered the service');
  });
});
