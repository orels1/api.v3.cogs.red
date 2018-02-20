module.exports = {
  'host': 'localhost',
  'port': 3030,
  'public': '../public/',
  'paginate': {
    'default': 10,
    'max': 50
  },
  'nedb': '../data',
  'authentication': {
    'secret': process.env.JWT_SECRET,
    'strategies': [
      'jwt'
    ],
    'path': '/authentication',
    'service': 'users',
    'jwt': {
      'header': {
        'typ': 'access'
      },
      'audience': 'https://yourdomain.com',
      'subject': 'anonymous',
      'issuer': 'feathers',
      'algorithm': 'HS256',
      'expiresIn': '1d'
    },
    'github': {
      'clientID': '6f5e5ca9d2df9f124b7e',
      'clientSecret': process.env.GH_SECRET,
      'successRedirect': '/'
    },
    'cookie': {
      'enabled': true,
      'name': 'feathers-jwt',
      'httpOnly': false,
      'secure': false
    }
  }
};

