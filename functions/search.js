const app = require('express')();
const router = require('express').Router();
const cors = require('cors');
const Fuse = require('fuse.js');
const Firestore = require('@google-cloud/firestore');
const { globalFlags } = require('./middleware');

const firestore = new Firestore({
  projectId: 'starlit-channel-244200'
});

const OPTIONS = {
  id: 'name',
  shouldSort: true,
  includeScore: true,
  includeMatches: true,
  threshold: 0.5,
  location: 0,
  distance: 100,
  maxPatternLength: 32,
  minMatchCharLength: 3,
  keys: [
    { name: 'name', weight: 0.7 },
    { name: 'tags', weight: 0.6 },
    { name: 'short', weight: 0.4 },
    { name: 'description', weight: 0.4 },
    { name: 'author.username', weight: 0.2 },
    { name: 'repo.name', weight: 0.2 }
  ]
};

app.use(globalFlags);
app.use(cors());

app.use('/search', router);

router.get('/', async (req, res) => {
  const { term } = req.query;
  const { showUnapproved, version } = req.flags;

  if (!term) {
    return res.send({
      count: 0,
      results: []
    });
  }

  let query = null;
  if (!showUnapproved) {
    query = firestore.collection('cogs').where('repoType', '==', 'approved');
  }
  if (version) {
    query = query.where('version', '==', 'version');
  }
  const cogs = await query.get();
  if (!cogs.docs) {
    return res.send({
      count: 0,
      results: []
    });
  }

  const cogsList = cogs.docs.map(c => c.data());
  const fuse = new Fuse(cogsList, OPTIONS);
  const results = fuse.search(term);
  return res.send({
    count: results.length,
    results
  });
});

module.exports = app;
