/**
 * Database Connection Utility
 * Provides connection pooling and basic query execution
 */

const { Pool } = require('pg');
require('dotenv').config();

const schema = process.env.DB_SCHEMA || 'magellan';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: `--search_path=${schema}`,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

/**
 * Execute a query
 * @param {string} query - SQL query
 * @param {array} params - Query parameters
 * @param {boolean} silent - Skip error logging (for expected fallback errors)
 * @returns {Promise} Query result
 */
async function query(sql, params = [], silent = false) {
  try {
    const result = await pool.query(sql, params);
    return result;
  } catch (error) {
    // Don't log expected column-not-found errors (used for fallback logic)
    if (!silent && error.code !== '42703') {
      console.error('Database query error:', error);
    }
    throw error;
  }
}

/**
 * Get a client from the pool for transactions
 */
async function getClient() {
  return await pool.connect();
}

/**
 * Close the pool
 */
async function closePool() {
  await pool.end();
}

module.exports = {
  query,
  getClient,
  pool,
  closePool,
};
