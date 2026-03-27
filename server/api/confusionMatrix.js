/**
 * Confusion Matrix API Endpoints
 * Calculates and returns type/subtype confusion matrices for drill-down
 */

const express = require('express');
const router = express.Router();
const dbLoader = require('../csv-loader');

/**
 * GET /confusion-matrix?run_id=...
 * Returns both type and subtype confusion matrices
 */
router.get('/confusion-matrix', async (req, res) => {
  try {
    const { run_id } = req.query;

    if (!run_id) {
      return res.status(400).json({ error: 'run_id is required' });
    }

    const typeMatrix = await dbLoader.getConfusionMatrix(parseInt(run_id), 'type');
    const subtypeMatrix = await dbLoader.getConfusionMatrix(parseInt(run_id), 'subtype');

    res.json({
      type_matrix: typeMatrix,
      subtype_matrix: subtypeMatrix,
    });
  } catch (error) {
    console.error('Error calculating confusion matrix:', error);
    res.status(500).json({ error: 'Failed to calculate confusion matrix' });
  }
});

/**
 * GET /confusion-matrix/subtype?run_id=...&true_type=...&pred_type=...
 * Returns subtype confusion matrix for a specific type pair
 */
router.get('/confusion-matrix/subtype', async (req, res) => {
  try {
    const { run_id, true_type, pred_type } = req.query;

    if (!run_id || !true_type || !pred_type) {
      return res.status(400).json({
        error: 'run_id, true_type, and pred_type are required',
      });
    }

    const subtypeMatrix = await dbLoader.getSubtypeMatrixForTypePair(parseInt(run_id), true_type, pred_type);

    res.json({
      type_pair: { true_type, pred_type },
      matrix: subtypeMatrix,
    });
  } catch (error) {
    console.error('Error calculating subtype confusion matrix:', error);
    res.status(500).json({ error: 'Failed to calculate subtype confusion matrix' });
  }
});

module.exports = router;
