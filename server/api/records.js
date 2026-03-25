/**
 * Records API Endpoints
 * Provides row-level record exploration and filtering
 */

const express = require('express');
const router = express.Router();
const { query } = require('../db');

/**
 * GET /records?run_id=...&filter=...
 * Returns row-level records with optional filtering
 */
router.get('/records', async (req, res) => {
  try {
    const { run_id, filter, true_type, pred_type, true_subtype, pred_subtype, limit = 100, offset = 0 } = req.query;

    if (!run_id) {
      return res.status(400).json({ error: 'run_id is required' });
    }

    let sql = `SELECT * FROM run_results WHERE run_id = $1`;
    const params = [run_id];
    let paramIndex = 2;

    // Apply filters
    if (filter === 'incorrect') {
      sql += ` AND (true_type != pred_type OR true_subtype != pred_subtype)`;
    }

    if (true_type) {
      sql += ` AND true_type = $${paramIndex}`;
      params.push(true_type);
      paramIndex++;
    }

    if (pred_type) {
      sql += ` AND pred_type = $${paramIndex}`;
      params.push(pred_type);
      paramIndex++;
    }

    if (true_subtype) {
      sql += ` AND true_subtype = $${paramIndex}`;
      params.push(true_subtype);
      paramIndex++;
    }

    if (pred_subtype) {
      sql += ` AND pred_subtype = $${paramIndex}`;
      params.push(pred_subtype);
      paramIndex++;
    }

    // Count total
    const countResult = await query(
      sql.replace(/SELECT \*/, 'SELECT COUNT(*) as total'),
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // Fetch paginated results
    sql += ` ORDER BY id ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    res.json({
      data: result.rows,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        count: result.rows.length,
      },
    });
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

    const result = await query(
      `SELECT * FROM run_results WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching record:', error);
    res.status(500).json({ error: 'Failed to fetch record' });
  }
});

module.exports = router;
