/**
 * Transition Matrix API Endpoints
 * Compares subtype predictions between two runs
 */

const express = require('express');
const router = express.Router();
const { query } = require('../db');

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

    const result = await query(
      `SELECT 
        r1.pred_subtype as pred_subtype_run1,
        r2.pred_subtype as pred_subtype_run2,
        COUNT(*) as count
      FROM run_results r1
      JOIN run_results r2 ON r1.record_id = r2.record_id
      WHERE r1.run_id = $1 AND r2.run_id = $2
      GROUP BY r1.pred_subtype, r2.pred_subtype
      HAVING COUNT(*) >= $3
      ORDER BY count DESC`,
      [run_id1, run_id2, min_count]
    );

    // Get unique subtypes
    const subtypesSet = new Set();
    result.rows.forEach(row => {
      subtypesSet.add(row.pred_subtype_run1);
      subtypesSet.add(row.pred_subtype_run2);
    });
    const subtypes = Array.from(subtypesSet).sort();

    // Build transition matrix
    const transitionMatrix = {};
    subtypes.forEach(t => {
      transitionMatrix[t] = {};
      subtypes.forEach(p => {
        transitionMatrix[t][p] = 0;
      });
    });

    result.rows.forEach(row => {
      transitionMatrix[row.pred_subtype_run1][row.pred_subtype_run2] = row.count;
    });

    res.json({
      rows: subtypes,
      cols: subtypes,
      data: transitionMatrix,
      runs: { run1: run_id1, run2: run_id2 },
      min_count: min_count,
    });
  } catch (error) {
    console.error('Error calculating transition matrix:', error);
    res.status(500).json({ error: 'Failed to calculate transition matrix' });
  }
});

module.exports = router;
