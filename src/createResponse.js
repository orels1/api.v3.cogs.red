module.exports = (body, statusCode = 200) =>
  ({
    statusCode,
    body: JSON.stringify(body)
  });