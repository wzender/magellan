/**
 * Database Loader
 * Provides same interface as csv-loader but reads from PostgreSQL database
 * This allows the API to work with the database-seeded data
 */

const { query } = require('./db');

/**
 * Load all benchmarks
 */
async function getAllBenchmarks() {
  try {
    const result = await query(
      'SELECT id, name, created_at FROM benchmarks ORDER BY id'
    );
    return result.rows;
  } catch (error) {
    console.error('Error loading benchmarks:', error);
    return [];
  }
}

/**
 * Get a specific benchmark
 */
async function getBenchmark(id) {
  try {
    const result = await query(
      'SELECT id, name, created_at FROM benchmarks WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error loading benchmark:', error);
    return null;
  }
}

/**
 * Get all runs for a benchmark
 */
async function getRunsByBenchmarkId(benchmarkId) {
  try {
    const result = await query(
      'SELECT id, benchmark_id, run_name, model_version, created_at FROM runs WHERE benchmark_id = $1 ORDER BY id',
      [benchmarkId]
    );
    return result.rows;
  } catch (error) {
    console.error('Error loading runs:', error);
    return [];
  }
}

/**
 * Get a specific run
 */
async function getRun(id) {
  try {
    const result = await query(
      'SELECT id, benchmark_id, run_name, model_version, created_at FROM runs WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error loading run:', error);
    return null;
  }
}

/**
 * Get leaderboard for a benchmark
 */
async function getLeaderboardByBenchmarkId(benchmarkId) {
  try {
    const result = await query(
      `SELECT l.id, l.run_id, l.benchmark_id, l.benchmark_length, 
              l.subtype_accuracy, l.subtype_f1_weighted, l.type_f1_weighted,
              r.run_name, r.model_version
       FROM leaderboard l
       JOIN runs r ON l.run_id = r.id
       WHERE l.benchmark_id = $1
       ORDER BY l.subtype_f1_weighted DESC`,
      [benchmarkId]
    );
    return result.rows;
  } catch (error) {
    console.error('Error loading leaderboard:', error);
    return [];
  }
}

/**
 * Get confusion matrix for a run
 */
async function getConfusionMatrix(runId, matrixType = 'type') {
  try {
    const typeCol = matrixType === 'type' ? 'true_type' : 'true_subtype';
    const predCol = matrixType === 'type' ? 'pred_type' : 'pred_subtype';

    const result = await query(
      `SELECT DISTINCT ${typeCol}, ${predCol} FROM run_results WHERE run_id = $1`,
      [runId]
    );

    // Build matrix structure
    const types = new Set();
    const matrixData = {};

    result.rows.forEach(row => {
      const trueVal = row[typeCol];
      const predVal = row[predCol];
      types.add(trueVal);
      types.add(predVal);

      if (!matrixData[trueVal]) matrixData[trueVal] = {};
      matrixData[trueVal][predVal] = 0;
    });

    // Count occurrences
    const countResult = await query(
      `SELECT ${typeCol} as true_val, ${predCol} as pred_val, COUNT(*) as count
       FROM run_results
       WHERE run_id = $1
       GROUP BY ${typeCol}, ${predCol}`,
      [runId]
    );

    countResult.rows.forEach(row => {
      if (!matrixData[row.true_val]) matrixData[row.true_val] = {};
      matrixData[row.true_val][row.pred_val] = parseInt(row.count);
    });

    const typeArray = Array.from(types).sort();

    return {
      rows: typeArray,
      cols: typeArray,
      data: matrixData,
    };
  } catch (error) {
    console.error('Error loading confusion matrix:', error);
    return { rows: [], cols: [], data: {} };
  }
}

/**
 * Get subtype confusion matrix filtered by a specific type pair
 */
async function getSubtypeMatrixForTypePair(runId, trueType, predType) {
  try {
    // Get all subtype transitions for this specific type pair
    const result = await query(
      `SELECT DISTINCT true_subtype, pred_subtype FROM run_results 
       WHERE run_id = $1 AND true_type = $2 AND pred_type = $3`,
      [runId, trueType, predType]
    );

    // Build matrix structure
    const subtypes = new Set();
    const matrixData = {};

    result.rows.forEach(row => {
      const trueVal = row.true_subtype;
      const predVal = row.pred_subtype;
      subtypes.add(trueVal);
      subtypes.add(predVal);

      if (!matrixData[trueVal]) matrixData[trueVal] = {};
      matrixData[trueVal][predVal] = 0;
    });

    // Count occurrences for this type pair
    const countResult = await query(
      `SELECT true_subtype, pred_subtype, COUNT(*) as count
       FROM run_results
       WHERE run_id = $1 AND true_type = $2 AND pred_type = $3
       GROUP BY true_subtype, pred_subtype`,
      [runId, trueType, predType]
    );

    countResult.rows.forEach(row => {
      if (!matrixData[row.true_subtype]) matrixData[row.true_subtype] = {};
      matrixData[row.true_subtype][row.pred_subtype] = parseInt(row.count);
    });

    const subtypeArray = Array.from(subtypes).sort();

    return {
      rows: subtypeArray,
      cols: subtypeArray,
      data: matrixData,
    };
  } catch (error) {
    console.error('Error loading subtype matrix for type pair:', error);
    return { rows: [], cols: [], data: {} };
  }
}

/**
 * Get transition matrix for two runs
 */
async function getTransitionMatrix(runId1, runId2, minCount = 1) {
  try {
    // Get all records from both runs
    const run1Result = await query(
      `SELECT record_id, pred_subtype, true_subtype, true_type FROM run_results WHERE run_id = $1`,
      [runId1]
    );

    const run2Result = await query(
      `SELECT record_id, pred_subtype, true_subtype, true_type FROM run_results WHERE run_id = $1`,
      [runId2]
    );

    // Build maps
    const run1Map = {};
    run1Result.rows.forEach(row => {
      run1Map[row.record_id] = {
        pred_subtype: row.pred_subtype,
        true_subtype: row.true_subtype,
        true_type: row.true_type,
        isCorrect: row.pred_subtype === row.true_subtype
      };
    });

    const transitionData = {};
    const subtypes = new Set();

    run2Result.rows.forEach(row => {
      const run1Data = run1Map[row.record_id];
      if (run1Data && run1Data.pred_subtype !== row.pred_subtype) {
        const run1Pred = run1Data.pred_subtype;
        const run2Pred = row.pred_subtype;
        const trueSubtype = run1Data.true_subtype;

        if (!transitionData[run1Pred]) transitionData[run1Pred] = {};
        if (!transitionData[run1Pred][run2Pred]) {
          transitionData[run1Pred][run2Pred] = {
            total: 0,
            run1Correct: 0,
            run2Correct: 0,
            bothWrong: 0
          };
        }

        const cell = transitionData[run1Pred][run2Pred];
        cell.total++;

        const run1IsCorrect = run1Pred === trueSubtype;
        const run2IsCorrect = run2Pred === trueSubtype;

        if (run1IsCorrect && !run2IsCorrect) {
          cell.run1Correct++;
        } else if (!run1IsCorrect && run2IsCorrect) {
          cell.run2Correct++;
        } else if (!run1IsCorrect && !run2IsCorrect) {
          cell.bothWrong++;
        }

        subtypes.add(run1Pred);
        subtypes.add(run2Pred);
      }
    });

    // Filter by minCount
    const filteredTransitionData = {};
    const filteredSubtypes = new Set();

    Object.keys(transitionData).forEach(run1Subtype => {
      Object.keys(transitionData[run1Subtype]).forEach(run2Subtype => {
        const cell = transitionData[run1Subtype][run2Subtype];
        if (cell.total >= minCount) {
          if (!filteredTransitionData[run1Subtype]) {
            filteredTransitionData[run1Subtype] = {};
          }
          filteredTransitionData[run1Subtype][run2Subtype] = cell;
          filteredSubtypes.add(run1Subtype);
          filteredSubtypes.add(run2Subtype);
        }
      });
    });

    const subtypeArray = Array.from(filteredSubtypes).sort();

    return {
      rows: subtypeArray,
      cols: subtypeArray,
      data: filteredTransitionData,
    };
  } catch (error) {
    console.error('Error loading transition matrix:', error);
    return { rows: [], cols: [], data: {} };
  }
}

/**
 * Get records with optional filtering
 */
async function getRecords(filters = {}) {
  try {
    let sql;
    const params = [];
    let paramCount = 1;
    let countSql;
    const countParams = [];
    let countParamCount = 1;

    if (filters.run_id2) {
      // Join run1 and run2 records by record_id to show both sides
      sql = `SELECT DISTINCT ON (r1.record_id) r1.id, r1.run_id, r1.record_id, r1.attributes, r1.metadata,
                     r1.true_type, r1.pred_type, r1.true_subtype, r1.pred_subtype,
                     r2.true_type as run2_true_type, r2.pred_type as run2_pred_type,
                     r2.true_subtype as run2_true_subtype, r2.pred_subtype as run2_pred_subtype
              FROM run_results r1
              JOIN run_results r2 ON r1.record_id = r2.record_id
              WHERE r1.run_id = $1 AND r2.run_id = $2
                AND r1.pred_subtype <> r2.pred_subtype`;
      params.push(filters.run_id1 || filters.run_id);
      params.push(filters.run_id2);

      // After binding run IDs, start dynamic params from 3.
      paramCount = 3;
      countParamCount = 3;

      if (filters.run1_pred_subtype) {
        sql += ` AND r1.pred_subtype = $${paramCount++}`;
        params.push(filters.run1_pred_subtype);
      }
      if (filters.run2_pred_subtype) {
        sql += ` AND r2.pred_subtype = $${paramCount++}`;
        params.push(filters.run2_pred_subtype);
      }
      if (filters.run1_true_subtype) {
        sql += ` AND r1.true_subtype = $${paramCount++}`;
        params.push(filters.run1_true_subtype);
      }
      if (filters.run2_true_subtype) {
        sql += ` AND r2.true_subtype = $${paramCount++}`;
        params.push(filters.run2_true_subtype);
      }

      countSql = `SELECT COUNT(DISTINCT r1.record_id) as total FROM run_results r1 JOIN run_results r2 ON r1.record_id = r2.record_id WHERE r1.run_id = $1 AND r2.run_id = $2 AND r1.pred_subtype <> r2.pred_subtype`;
      countParams.push(filters.run_id1 || filters.run_id);
      countParams.push(filters.run_id2);

      // countParamCount already set to 3 earlier for dynamic search filters
      if (filters.run1_pred_subtype) {
        countSql += ` AND r1.pred_subtype = $${countParamCount++}`;
        countParams.push(filters.run1_pred_subtype);
      }
      if (filters.run2_pred_subtype) {
        countSql += ` AND r2.pred_subtype = $${countParamCount++}`;
        countParams.push(filters.run2_pred_subtype);
      }
      if (filters.run1_true_subtype) {
        countSql += ` AND r1.true_subtype = $${countParamCount++}`;
        countParams.push(filters.run1_true_subtype);
      }
      if (filters.run2_true_subtype) {
        countSql += ` AND r2.true_subtype = $${countParamCount++}`;
        countParams.push(filters.run2_true_subtype);
      }

    } else {
      sql = 'SELECT id, run_id, record_id, attributes, metadata, true_type, pred_type, true_subtype, pred_subtype FROM run_results WHERE 1=1';

      if (filters.run_id) {
        sql += ` AND run_id = $${paramCount++}`;
        params.push(filters.run_id);
      }
      if (filters.true_type) {
        sql += ` AND true_type = $${paramCount++}`;
        params.push(filters.true_type);
      }
      if (filters.pred_type) {
        sql += ` AND pred_type = $${paramCount++}`;
        params.push(filters.pred_type);
      }
      if (filters.true_subtype) {
        sql += ` AND true_subtype = $${paramCount++}`;
        params.push(filters.true_subtype);
      }
      if (filters.pred_subtype) {
        sql += ` AND pred_subtype = $${paramCount++}`;
        params.push(filters.pred_subtype);
      }

      countSql = 'SELECT COUNT(*) as total FROM run_results WHERE 1=1';
      if (filters.run_id) {
        countSql += ` AND run_id = $${countParamCount++}`;
        countParams.push(filters.run_id);
      }
      if (filters.true_type) {
        countSql += ` AND true_type = $${countParamCount++}`;
        countParams.push(filters.true_type);
      }
      if (filters.pred_type) {
        countSql += ` AND pred_type = $${countParamCount++}`;
        countParams.push(filters.pred_type);
      }
      if (filters.true_subtype) {
        countSql += ` AND true_subtype = $${countParamCount++}`;
        countParams.push(filters.true_subtype);
      }
      if (filters.pred_subtype) {
        countSql += ` AND pred_subtype = $${countParamCount++}`;
        countParams.push(filters.pred_subtype);
      }
    }

    if (filters.run_id2) {
      sql += ' ORDER BY r1.record_id, r1.id LIMIT $' + paramCount + ' OFFSET $' + (paramCount + 1);
    } else {
      sql += ' ORDER BY record_id, id LIMIT $' + paramCount + ' OFFSET $' + (paramCount + 1);
    }
    params.push(filters.limit || 100);
    params.push(filters.offset || 0);

    const result = await query(sql, params);

    // Parse JSON fields
    const data = result.rows.map(row => ({
      ...row,
      attributes: typeof row.attributes === 'string' ? JSON.parse(row.attributes) : row.attributes,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
    }));

    // Get total count for pagination
    const countResult = await query(countSql, countParams);
    const total = parseInt(countResult.rows[0].total);

    return {
      data,
      pagination: {
        total,
        limit: filters.limit || 100,
        offset: filters.offset || 0,
        pages: Math.ceil(total / (filters.limit || 100)),
      },
    };
  } catch (error) {
    console.error('Error loading records:', error);
    return { data: [], pagination: { total: 0, limit: 100, offset: 0, pages: 0 } };
  }
}

module.exports = {
  getAllBenchmarks,
  getBenchmark,
  getRunsByBenchmarkId,
  getRun,
  getLeaderboardByBenchmarkId,
  getConfusionMatrix,
  getSubtypeMatrixForTypePair,
  getTransitionMatrix,
  getRecords,
};
