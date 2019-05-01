const fetch = require('node-fetch');
const WH_URL = process.env.WH_URL;

const levelMap = {
  info: 0x0068ff,
  danger: 0xff0000,
  success: 0x00f97d
};

const createEmbed = ({ title, content, level = info }) => ({
  embeds: [
    {
      title,
      color: levelMap[level],
      description: content,
      footer: { text: 'api.cogs.red' }
    }
  ]
});

exports.notify = async content => {
  let transformed = {
    content
  };
  console.log('notifying', WH_URL, content);
  if (typeof content !== 'string') {
    transformed = createEmbed({
      ...content
    });
  }
  return fetch(WH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ...transformed,
      username: 'cogs.red'
    })
  });
};
