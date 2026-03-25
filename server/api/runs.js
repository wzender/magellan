/**
 * Runs API Endpoints
 * Manages loading, listing, and comparing runs
 */

const express = require('express');
const router = express.Router();
const { query } = require('../db');

/**
 * GET /runs?benchmark_id=...
 * Returns list of runs for a specific benchmark
 */
router.get('/runs', async (req, res) => {
  try {
    const { benchmark_id } = req.query;

    if (!benchmark_id) {
      return res.status(400).json({ error: 'benchmark_id is required' });
    }

    const result = await query(
      `SELECT r.id, r.run_name, r.model_version, r.created_at
       FROM runs r
       WHERE r.benchmark_id = $1
       ORDER BY r.created_at DESC`,
      [benchmark_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching runs:', error);
    res.status(500).json({ error: 'Failed to fetch runs' });
  }
});

/**
 * GET /runs/:id
 * Returns details for a specific run
 */
router.get('/runs/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT r.id, r.run_name, r.model_version, r.benchmark_id, r.created_at,
              b.name as benchmark_name, COUNT(rr.id) as record_count
       FROM runs r
       LEFT JOIN benchmarks b ON r.benchmark_id = b.id
       LEFT JOIN run_results rr ON r.id = rr.run_id
       WHERE r.id = $1
       GROUP BY r.id, b.id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Run not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching run:', error);
    res.status(500).json({ error: 'Failed to fetch run' });
  }
});

module.exports = router;
