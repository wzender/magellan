/**
 * Records API Endpoints
 * Provides row-level record exploration and filtering
 */

const express = require('express');
const router = express.Router();
const dbLoader = require('../loader');

/**
 * GET /records?run_id=...&filter=...
 * Returns row-level records with optional filtering
 */
router.get('/records', async (req, res) => {
  try {
    const {
      run_id,
      run_id1,
      run_id2,
      filter,
      compare_filter,
      true_type,
      pred_type,
      true_subtype,
      pred_subtype,
      run1_pred_subtype,
      run2_pred_subtype,
      run1_true_subtype,
      run2_true_subtype,
      limit = 100,
      offset = 0,
    } = req.query;

    if (!run_id && !run_id1) {
      return res.status(400).json({ error: 'run_id or run_id1 is required' });
    }

    const filters = {
      run_id: run_id ? parseInt(run_id) : undefined,
      run_id1: run_id1 ? parseInt(run_id1) : undefined,
      run_id2: run_id2 ? parseInt(run_id2) : undefined,
      limit: parseInt(limit),
      offset: parseInt(offset),
    };

    if (true_type) filters.true_type = true_type;
    if (pred_type) filters.pred_type = pred_type;
    if (true_subtype) filters.true_subtype = true_subtype;
    if (pred_subtype) filters.pred_subtype = pred_subtype;
    if (run1_pred_subtype) filters.run1_pred_subtype = run1_pred_subtype;
    if (run2_pred_subtype) filters.run2_pred_subtype = run2_pred_subtype;
    if (run1_true_subtype) filters.run1_true_subtype = run1_true_subtype;
    if (run2_true_subtype) filters.run2_true_subtype = run2_true_subtype;
    if (compare_filter) filters.compareFilter = compare_filter;
    if (filter) {
      const parts = filter.split(',').map(f => f.trim());
      if (parts.includes('incorrect'))  filters.incorrectOnly  = true;
      if (parts.includes('correct'))    filters.correctOnly    = true;
      if (parts.includes('same_type'))  filters.sameTypeOnly   = true;
      if (parts.includes('cross_type')) filters.crossTypeOnly  = true;
      // When multiple correctness filters are selected, use OR logic
      if ((filters.correctOnly ? 1 : 0) + (filters.sameTypeOnly ? 1 : 0) + (filters.crossTypeOnly ? 1 : 0) > 1) {
        filters.correctnessOr = parts.filter(p => ['correct', 'same_type', 'cross_type'].includes(p));
        delete filters.correctOnly;
        delete filters.sameTypeOnly;
        delete filters.crossTypeOnly;
      }
    }

    console.log('Records API called with filters:', JSON.stringify(filters, null, 2));

    const result = await dbLoader.getRecords(filters);

    res.json(result);
  } catch (error) {
    console.error('Error fetching records:', error);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

/**
 * GET /records/:id
 * Returns a single record by ID
 */
router.get('/records/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await dbLoader.getRecords({ limit: 1, offset: 0 });
    const allRecords = result.data;
    const record = allRecords.find(r => r.id === parseInt(id));

    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }

    res.json(record);
  } catch (error) {
    console.error('Error fetching record:', error);
    res.status(500).json({ error: 'Failed to fetch record' });
  }
});

module.exports = router;
