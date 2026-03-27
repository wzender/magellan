/**
 * Alternative database setup using Node.js
 * Run: node setup-db.js
 */

const { Pool, Client } = require('pg');
const fs = require('fs');
require('dotenv').config();

async function setupDatabase() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: 'postgres',
  });

  const client = await pool.connect();

  try {
    console.log('Connecting to PostgreSQL...');
    
    // Create database if it doesn't exist
    const dbName = process.env.DB_NAME || 'classification_eval';
    try {
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`✓ Database '${dbName}' created`);
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log(`✓ Database '${dbName}' already exists`);
      } else {
        throw err;
      }
    }

    client.release();
    await pool.end();

    // Reconnect to the new database using a regular client (not pool) to handle multi-statement SQL
    const dbClient = new Client({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: dbName,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    });

    await dbClient.connect();

    // Read schema and execute as a single query
    const schema = fs.readFileSync('./db/schema.sql', 'utf-8');
    
    console.log('Creating database schema...');
    await dbClient.query(schema);
    
    console.log('✓ Database schema created successfully');
    await dbClient.end();

  } catch (error) {
    console.error('❌ Error setting up database:', error.message);
    process.exit(1);
  }
}

setupDatabase();
