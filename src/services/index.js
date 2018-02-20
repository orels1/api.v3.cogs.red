const cogs = require('./cogs/cogs.service.js');
const users = require('./users/users.service.js');
const valid = require('./valid/valid.service.js');
const github = require('./github/github.service.js');
const wh = require('./wh/wh.service.js');
// eslint-disable-next-line no-unused-vars
module.exports = function (app) {
  app.configure(cogs);
  app.configure(users);
  app.configure(valid);
  app.configure(github);
  app.configure(wh);
};
