exports.getBody = event => {
  const { body } = event;
  if (!body) {
    return { err: { error: 'No body supplied' }, body: null };
  }
  try {
    return { err: null, body: JSON.parse(body) };
  } catch (e) {
    return {
      err: {
        error: 'Body mailformed',
        error_details: e.message
      },
      body: null
    };
  }
};
