/**
 * Leaderboard API Endpoints
 * Retrieves aggregated metrics per benchmark
 */

const express = require('express');
const router = express.Router();
const dbLoader = require('../csv-loader');

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

    const data = await dbLoader.getLeaderboardByBenchmarkId(parseInt(benchmark_id));
    res.json(data);
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
    const data = await dbLoader.getAllBenchmarks();
    res.json(data);
  } catch (error) {
    console.error('Error fetching benchmarks:', error);
    res.status(500).json({ error: 'Failed to fetch benchmarks' });
  }
});

module.exports = router;
