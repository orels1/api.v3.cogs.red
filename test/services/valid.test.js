const assert = require('assert');
const app = require('../../src/app');

describe('\'valid\' service', () => {
  it('registered the service', () => {
    const service = app.service('valid');

    assert.ok(service, 'Registered the service');
  });
});
