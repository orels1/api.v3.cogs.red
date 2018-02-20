const url = require('url');

/* eslint-disable no-unused-vars */
class Service {
  constructor (options) {
    this.options = options || {};
  }

  async setup(app) {
    this.github = app.service('github');
  }

  async get (addr, params) {
    const repoUrl = url.parse(addr);
    const repo = repoUrl.path.endsWith('/') ?
      repoUrl.path.substr(1, repoUrl.path.length - 1) :
      repoUrl.path.substr(1);

    if (params.query && params.query.type) {
      switch(params.query.type) {
      case 'list':
        return this.github.listCogs(repo);
      case 'cogs':
        return this.github.cogsInfo(repo);
      case 'repo':
        return this.github.repoInfo(repo);
      }
    }

    const repoInfo = await this.github.repoInfo(repo);
    const cogsInfo = await this.github.cogsInfo(repo);
    return { valid: true, data: {
      repo: repoInfo,
      cogs: cogsInfo
    } };
  }
}

module.exports = function (options) {
  return new Service(options);
};

module.exports.Service = Service;
