/**
 * Confusion Matrix API Endpoints
 * Calculates and returns type/subtype confusion matrices for drill-down
 */

const express = require('express');
const router = express.Router();
const { query } = require('../db');

/**
 * GET /confusion-matrix?run_id=...
 * Returns both type and subtype confusion matrices
 */
router.get('/confusion-matrix', async (req, res) => {
  try {
    const { run_id, filter } = req.query;

    if (!run_id) {
      return res.status(400).json({ error: 'run_id is required' });
    }

    // For type confusion matrix
    const typeMatrixQuery = `
      SELECT 
        true_type,
        pred_type,
        COUNT(*) as count
      FROM run_results
      WHERE run_id = $1
      ${filter === 'incorrect' ? 'AND true_type != pred_type' : ''}
      GROUP BY true_type, pred_type
      ORDER BY true_type, pred_type
    `;

    const typeResult = await query(typeMatrixQuery, [run_id]);

    // Get unique types for matrix structure
    const typesSet = new Set();
    typeResult.rows.forEach(row => {
      typesSet.add(row.true_type);
      typesSet.add(row.pred_type);
    });
    const types = Array.from(typesSet).sort();

    // Build type confusion matrix
    const typeMatrix = {};
    types.forEach(t => {
      typeMatrix[t] = {};
      types.forEach(p => {
        typeMatrix[t][p] = 0;
      });
    });

    typeResult.rows.forEach(row => {
      typeMatrix[row.true_type][row.pred_type] = row.count;
    });

    // For subtype confusion matrix (top confusion pairs by count)
    const subtypeMatrixQuery = `
      SELECT 
        true_subtype,
        pred_subtype,
        COUNT(*) as count
      FROM run_results
      WHERE run_id = $1
      ${filter === 'incorrect' ? 'AND true_subtype != pred_subtype' : ''}
      GROUP BY true_subtype, pred_subtype
      ORDER BY count DESC
      LIMIT 100
    `;

    const subtypeResult = await query(subtypeMatrixQuery, [run_id]);

    res.json({
      type_matrix: {
        rows: types,
        cols: types,
        data: typeMatrix,
      },
      subtype_matrix: {
        data: subtypeResult.rows,
      },
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

    const result = await query(
      `SELECT 
        true_subtype,
        pred_subtype,
        COUNT(*) as count
      FROM run_results
      WHERE run_id = $1 AND true_type = $2 AND pred_type = $3
      GROUP BY true_subtype, pred_subtype
      ORDER BY true_subtype, pred_subtype`,
      [run_id, true_type, pred_type]
    );

    // Get unique subtypes for matrix structure
    const subtypesSet = new Set();
    result.rows.forEach(row => {
      subtypesSet.add(row.true_subtype);
      subtypesSet.add(row.pred_subtype);
    });
    const subtypes = Array.from(subtypesSet).sort();

    // Build subtype confusion matrix
    const subtypeMatrix = {};
    subtypes.forEach(t => {
      subtypeMatrix[t] = {};
      subtypes.forEach(p => {
        subtypeMatrix[t][p] = 0;
      });
    });

    result.rows.forEach(row => {
      subtypeMatrix[row.true_subtype][row.pred_subtype] = row.count;
    });

    res.json({
      rows: subtypes,
      cols: subtypes,
      data: subtypeMatrix,
      type_pair: { true_type, pred_type },
    });
  } catch (error) {
    console.error('Error calculating subtype confusion matrix:', error);
    res.status(500).json({ error: 'Failed to calculate subtype confusion matrix' });
  }
});

module.exports = router;
