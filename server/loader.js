/**
 * Data source selector.
 * Set DATA_SOURCE=postgres in .env to use PostgreSQL.
 * Defaults to CSV.
 */
require('dotenv').config();

const source = (process.env.DATA_SOURCE || 'csv').toLowerCase();

if (source === 'postgres') {
  console.log('Data source: PostgreSQL');
  module.exports = require('./db-loader');
} else {
  console.log('Data source: CSV');
  module.exports = require('./csv-loader');
}
