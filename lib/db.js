const { neon } = require('@neondatabase/serverless');
const config   = require('./config');

let _sql = null;

function getDb() {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set.');
  }
  if (!_sql) {
    _sql = neon(config.databaseUrl);
  }
  return _sql;
}

module.exports = { getDb };
