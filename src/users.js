const createResponse = require('./createResponse');

exports.get = async (event) => {
  console.log(event);

  return createResponse({
    foo: 'bar'
  });
  // const params = {
  //   TableName: USERS_TABLE,
  //   Key: {
  //     userId: req.params.userId
  //   }
  // };

  // try {
  //   const result = await dynamoDb.get(params).promise();
  //   if (result.Item) {
  //     const { userId, name } = result.Item;
  //     res.json({ userId, name });
  //   } else {
  //     res.status(404).json({ error: 'User not found' });
  //   }
  // } catch (e) {
  //   console.error(error);
  //   res.status(400).json({ error: 'Could not get user' });
  // }
}