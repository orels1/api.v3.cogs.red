const Firestore = require('@google-cloud/firestore');
const merge = require('lodash/merge');
const { flagsFilter, mapCollection } = require('./utils');

const firestore = new Firestore({
  projectId: 'starlit-channel-244200'
});

const updateRepoByPath = async (path, data) => {
  const collection = await firestore
    .collection('repos')
    .where('path', '==', path)
    .get();
  if (!collection.size) {
    return null;
  }
  const id = collection.docs[0].id;
  const repoData = collection.docs[0].data();
  const updated = await firestore
    .collection('repos')
    .doc(id)
    .update(data);
  return merge(repoData, data);
};

exports.updateRepoByPath = updateRepoByPath;

const updateCogByPath = async (path, data) => {
  const collection = await firestore
    .collection('cogs')
    .where('path', '==', path)
    .get();
  if (!collection.size) {
    return null;
  }
  const id = collection.docs[0].id;
  const cogData = collection.docs[0].data();
  const updated = await firestore
    .collection('cogs')
    .doc(id)
    .update(data);
  return merge(cogData, data);
};

exports.updateCogByPath = updateCogByPath;

const getCogsForRepo = async (username, repo, branch) => {
  const collection = await firestore
    .collection('cogs')
    .where('authorName', '==', username)
    .where('repoName', '==', repo)
    .where('branchName', '==', branch)
    .get();

  const result = [];
  if (collection.docs) {
    collection.docs.forEach(cog => {
      result.push({
        id: cog.id,
        ...cog.data()
      });
    });
  }
  return result;
};

exports.getCogsForRepo = getCogsForRepo;

const getItemsByParams = async (
  req,
  collectionName,
  username,
  repo,
  branch,
  cog
) => {
  let query = firestore.collection(collectionName);
  if (username) {
    query = query.where('authorName', '==', username);
  }
  if (repo) {
    const paramName = collectionName === 'cogs' ? 'repoName' : 'name';
    query = query.where(paramName, '==', repo);
  }
  if (branch) {
    const paramName = collectionName === 'cogs' ? 'branchName' : 'branch';
    query = query.where(paramName, '==', branch);
  }
  if (cog && collectionName === 'cogs') {
    query = query.where('name', '==', cog);
  }
  query = flagsFilter(req, query, collectionName);
  const collection = await query.get();
  let results = null;
  if (!cog) {
    const results = mapCollection(collection);
    return results;
  } else {
    const results = mapCollection(collection);
    return results.length ? results[0] : {};
  }
};

exports.getItemsByParams = getItemsByParams;

const getItemByPath = async (req, collectionName, path) => {
  const query = firestore.collection(collectionName).where('path', '==', path);
  const collection = await flagsFilter(req, query).get();
  const results = mapCollection(collection);
  return results.length ? results[0] : {};
};

exports.getItemByPath = getItemByPath;
