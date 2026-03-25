/**
 * Leaderboard API Endpoints
 * Retrieves aggregated metrics per benchmark
 */

const express = require('express');
const router = express.Router();
const { query } = require('../db');

/**
 * GET /leaderboard?benchmark_id=...
 * Returns leaderboard metrics for a specific benchmark
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const { benchmark_id } = req.query;

    if (!benchmark_id) {
      return res.status(400).json({ error: 'benchmark_id is required' });
    }

    const result = await query(
      `SELECT 
        l.run_id,
        r.run_name,
        r.model_version,
        l.benchmark_length,
        l.subtype_accuracy,
        l.subtype_f1_weighted,
        l.type_f1_weighted,
        l.created_at
      FROM leaderboard l
      JOIN runs r ON l.run_id = r.id
      WHERE l.benchmark_id = $1
      ORDER BY l.subtype_accuracy DESC, l.created_at DESC`,
      [benchmark_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

/**
 * GET /leaderboard/benchmarks
 * Returns all available benchmarks
 */
router.get('/benchmarks', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, created_at FROM benchmarks ORDER BY name ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching benchmarks:', error);
    res.status(500).json({ error: 'Failed to fetch benchmarks' });
  }
});

module.exports = router;
