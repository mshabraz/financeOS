let _SQL = null;

async function getSQL() {
  if (_SQL) return _SQL;
  const initSqlJs = require('sql.js');
  _SQL = await initSqlJs();
  return _SQL;
}

module.exports = { getSQL };
