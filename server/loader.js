/**
 * Data source selector.
 * Set DATA_SOURCE=postgres in .env to use PostgreSQL.
 * Falls back to CSV if DATA_SOURCE is not set or DATABASE_URL is missing.
 */
require('dotenv').config();

const wantsPostgres = (process.env.DATA_SOURCE || '').toLowerCase() === 'postgres';
const hasDbUrl      = !!process.env.DATABASE_URL;

if (wantsPostgres && hasDbUrl) {
  console.log('Data source: PostgreSQL');
  module.exports = require('./db-loader');
} else {
  if (wantsPostgres && !hasDbUrl) {
    console.warn('⚠ DATA_SOURCE=postgres but DATABASE_URL is not set — falling back to CSV');
  }
  console.log('Data source: CSV');
  module.exports = require('./csv-loader');
}
