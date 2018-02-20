const fetch = require('node-fetch');
const filter = require('lodash/filter');
const compact = require('lodash/compact');
const map = require('lodash/map');
const errors = require('@feathersjs/errors');

/* eslint-disable no-unused-vars */
class Service {
  constructor (options) {
    this.options = options || {};
    this.API_ROOT = 'https://api.github.com';
    this.HEADERS = {
      'Content-Type': 'application/json',
    };
  }

  async setup(app) {
    const query = await app.service('users').find({ 'github.profile.login': 'orels1'});
    const token = query.data[0].github.accessToken;
    this.HEADERS.Authorization = `bearer ${token}`;
  }

  async getContents(repo, path, noReject) {
    const url = `${this.API_ROOT}/repos/${repo}/contents/${path}`;
    const resp = await fetch(url, { headers: this.HEADERS });
    if (resp.status === 404) {
      if (noReject) return null;
      throw new errors.NotFound('Repo / info.json not found');
    }
    const json = await resp.json();
    return json;
  }

  parse(data, noReject) {
    const decoded = new Buffer(data, 'base64').toString('utf8');
    let parsed = {};
    try {
      parsed = JSON.parse(decoded);
    } catch (e) {
      if (noReject) return null;
      throw new errors.Unprocessable('Could not parse info.json');
    }
    return parsed;
  }

  async repoInfo(repo) {
    const data = await this.getContents(repo, 'info.json');
    return this.parse(data.content);
  }

  async listCogs(repo) {
    const data = await this.getContents(repo, '');
    if (!data)  throw new errors.NotFound('Repo not found');
    const cogs = filter(data, { type: 'dir' });
    return cogs.map(c => c.name);
  }

  async cogsInfo(repo) {
    // grab all the data
    const cogs = await this.listCogs(repo);
    const data = await Promise.all(cogs.map(c => this.getContents(repo, `${c}/info.json`, true)));
    const info = data.map(c => this.parse(c.content, true));
    const cogsWData = cogs.map((c, index) => ({
      name: c,
      info: info[index]
    }));

    const broken = [];
    const missing = [];

    // sort broken and missing cogs
    const valid = compact(map(cogsWData, (c) => {
      if (c.info && c.info !== null) return c;
      if (c.info === null) {
        broken.push(c.name);
        return null;
      }
      missing.push(c.name);
      return null;
    }));
    return { valid, broken, missing };
  }
}

module.exports = function (options) {
  return new Service(options);
};

module.exports.Service = Service;
