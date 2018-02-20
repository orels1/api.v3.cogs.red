module.exports = function () {
  return async context => {
    const valid = context.app.service('valid');
    const validated = await valid.get(`https://github.com/${context.data.author}/${context.data.repo}`);
    context.data.cogs = validated.data.cogs.valid;
    return context;
  };
};
