const flagsFilter = (req, collection, collectionName) => {
  if (!req.flags) {
    return collection;
  }
  const { showUnapproved, showHidden, version, anon } = req.flags;
  let query = collection;
  // only show approved cogs
  if (!showUnapproved) {
    typeKey = collectionName === 'repos' ? 'type' : 'repoType';
    query = query.where(typeKey, '==', 'approved');
  }
  if (!showHidden || anon) {
    query = query.where('hidden', '==', false);
  }
  // filter by version
  if (version) {
    query = query.where('version', '==', 'version');
  }
  return query;
};

exports.flagsFilter = flagsFilter;

const mapCollection = collection => {
  const results = [];
  if (collection.docs) {
    collection.forEach(i => {
      const data = i.data();
      results.push({
        id: i.id,
        ...data
      });
    });
  }
  return results;
};

exports.mapCollection = mapCollection;

const RESERVED = [
  'False',
  'None',
  'True',
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield'
];

const WRONG_START = /^[\d.].*/;

const nameValidityCheck = name => {
  valid = true;

  // check if first is a number
  if (WRONG_START.test(name)) {
    return false;
  }

  // check ascii table
  valid = ![...name].some(char => {
    const code = char.charCodeAt(0);
    if (code < 48) {
      return true;
    }
    if (code > 90 && code < 97 && code !== 95) {
      // accept underscore
      return true;
    }
    if (code > 122) {
      return true;
    }
    return false;
  });

  // check reserved
  for (const keyword of RESERVED) {
    if (name === keyword) {
      return false;
    }
  }

  return valid;
};

exports.nameValidityCheck = nameValidityCheck;
