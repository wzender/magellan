/**
 * Transition Matrix API Endpoints
 * Compares subtype predictions between two runs
 */

const express = require('express');
const router = express.Router();
const dbLoader = require('../db-loader');

/**
 * GET /transition-matrix?run_id1=...&run_id2=...&min_count=...
 * Returns transition matrix showing subtype label changes between runs
 */
router.get('/transition-matrix', async (req, res) => {
  try {
    const { run_id1, run_id2, min_count = 1 } = req.query;

    if (!run_id1 || !run_id2) {
      return res.status(400).json({
        error: 'run_id1 and run_id2 are required',
      });
    }

    const data = await dbLoader.getTransitionMatrix(parseInt(run_id1), parseInt(run_id2), parseInt(min_count));
    
    res.json({
      ...data,
      runs: { run1: run_id1, run2: run_id2 },
      min_count: min_count,
    });
  } catch (error) {
    console.error('Error calculating transition matrix:', error);
    res.status(500).json({ error: 'Failed to calculate transition matrix' });
  }
});

module.exports = router;
