/**
 * Runs API Endpoints
 * Manages loading, listing, and comparing runs
 */

const express = require('express');
const router = express.Router();
const dbLoader = require('../loader');

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

    const data = await dbLoader.getRunsByBenchmarkId(parseInt(benchmark_id));
    res.json(data);
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

    const run = await dbLoader.getRun(parseInt(id));
    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    const records = await dbLoader.getRecords({ run_id: parseInt(id), limit: 1, offset: 0 });
    res.json({
      ...run,
      record_count: records.pagination.total,
    });
  } catch (error) {
    console.error('Error fetching run:', error);
    res.status(500).json({ error: 'Failed to fetch run' });
  }
});

module.exports = router;
