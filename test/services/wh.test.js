const assert = require('assert');
const app = require('../../src/app');

describe('\'wh\' service', () => {
  it('registered the service', () => {
    const service = app.service('wh');

    assert.ok(service, 'Registered the service');
  });
});
