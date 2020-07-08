const app = require('express')();
const router = require('express').Router();
const Firestore = require('@google-cloud/firestore');
const cors = require('cors');
const reduce = require('lodash/reduce');
const { globalFlags, json, ownerCheck, roleCheck } = require('./middleware');
const {
  updateCogByPath,
  updateRepoByPath,
  getCogsForRepo,
  getItemsByParams
} = require('./db');

const firestore = new Firestore({
  projectId: 'starlit-channel-244200'
});

app.use(cors());
app.use(json);

app.use('/panel', router);

router.delete(
  '/:username/:repoName/:repoBranch',
  ownerCheck,
  roleCheck('staff'),
  async (req, res) => {
    const { username, repoName, repoBranch } = req.params;
    const repo = await firestore
      .collection('repos')
      .where('authorName', '==', username)
      .where('name', '==', repoName)
      .where('branch', '==', repoBranch)
      .get();
    if (!repo.docs) {
      return res.status(404).send({
        error: 'Repo does not exist'
      });
    }

    const id = repo.docs[0].id;
    await firestore
      .collection('repos')
      .doc(id)
      .delete();

    const cogs = await getCogsForRepo(username, repoName, repoBranch);

    let cogsRemoved = [];
    if (cogs.length) {
      const promises = cogs.map(c =>
        firestore
          .collection('cogs')
          .doc(c.id)
          .delete()
      );
      await Promise.all(promises);
      cogsRemoved = cogs.map(c => c.path);
    }

    return res.send({
      success: true,
      result: {
        repoRemoved: repo.docs[0].data().path,
        cogsRemoved
      }
    });
  }
);

router.patch(
  '/:username/:repoName/:repoBranch/hide',
  ownerCheck,
  async (req, res) => {
    const { username, repoName, repoBranch } = req.params;
    const { hidden } = req.body;
    const repoPath = `${username}/${repoName}/${repoBranch}`;
    console.log(repoPath, hidden);
    const updatedRepo = await updateRepoByPath(repoPath, {
      hidden
    });

    const cogsList = await getCogsForRepo(username, repoName, repoBranch);

    let updatedCogs = [];
    if (cogsList.length) {
      const promises = cogsList.map(c =>
        firestore
          .collection('cogs')
          .doc(c.id)
          .update({ hidden })
      );
      await Promise.all(promises);
      updatedCogs = cogsList.map(c => c.path);
    }

    res.send({
      success: true,
      repo: updatedRepo,
      cogs: updatedCogs
    });
  }
);

router.patch(
  '/:username/:repoName/:repoBranch/approve',
  roleCheck(['staff', 'qa']),
  async (req, res) => {
    const { username, repoName, repoBranch } = req.params;
    const { approved } = req.body;
    const repoPath = `${username}/${repoName}/${repoBranch}`;
    console.log(repoPath, approved);
    const updatedRepo = await updateRepoByPath(repoPath, {
      type: approved
    });

    const cogsList = await getItemsByParams(
      req,
      'cogs',
      username,
      repoName,
      repoBranch
    );

    let updatedCogs = [];
    if (cogsList.length) {
      const promises = cogsList.map(c =>
        firestore
          .collection('cogs')
          .doc(c.id)
          .update({
            repoType: approved,
            repo: {
              ...c.repo,
              type: approved
            }
          })
      );
      await Promise.all(promises);
      updatedCogs = cogsList.map(c => c.path);
    }

    res.send({
      success: true,
      repo: updatedRepo,
      cogs: updatedCogs
    });
  }
);

module.exports = app;
