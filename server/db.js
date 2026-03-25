/**
 * Database Connection Utility
 * Provides connection pooling and basic query execution
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'classification_eval',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

/**
 * Execute a query
 * @param {string} query - SQL query
 * @param {array} params - Query parameters
 * @returns {Promise} Query result
 */
async function query(sql, params = []) {
  try {
    const result = await pool.query(sql, params);
    return result;
  } catch (error) {
    console.error('Database query error:', error);
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
