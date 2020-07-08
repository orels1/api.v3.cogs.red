const app = require('express')();
const bodyParser = require('body-parser');
const { nameValidityCheck } = require('./utils');

app.use(bodyParser.json());

app.post('/', (req, res) => {
  const { name } = req.body;
  const isValid = nameValidityCheck(name);
  res.send({ isValid });
});

module.exports = app;
