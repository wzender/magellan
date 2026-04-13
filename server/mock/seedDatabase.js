/**
 * Seed Database with Mock Data
 * Generates and inserts 2-3 benchmarks with realistic mock data
 * Creates transitions between runs by using same records with different predictions
 */

require('dotenv').config();
const { query, getClient } = require('../db');
const { generateBenchmarkData, calculateMetrics, generateTaxonomy, generateTransitionVariant } = require('./mockDataGenerator');

async function seedDatabase() {
  const client = await getClient();

  try {
    console.log('Starting database seeding...');

    // Create benchmarks
    const benchmarks = [
      { name: 'Benchmark Q1 2026' },
      { name: 'Benchmark Q2 2026' },
      { name: 'Test Benchmark' },
    ];

    const benchmarkResults = await Promise.all(
      benchmarks.map(b =>
        query(
          'INSERT INTO benchmarks (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
          [b.name]
        )
      )
    );

    const benchmarkIds = benchmarkResults.map(r => r.rows[0].id);

    // Generate taxonomy once
    const taxonomy = generateTaxonomy();
    const { subtypeMap } = taxonomy;

    // Create runs and insert data for each benchmark
    for (let bIdx = 0; bIdx < benchmarkIds.length; bIdx++) {
      const benchmarkId = benchmarkIds[bIdx];

      // Create 2-3 runs per benchmark
      const runsPerBenchmark = bIdx === 2 ? 3 : 3;  // Test benchmark gets 3 runs too
      let baselineData = null;

      for (let rIdx = 0; rIdx < runsPerBenchmark; rIdx++) {
        const runName = `model_v${rIdx + 1}`;
        const modelVersion = `1.${rIdx}.0`;

        // Insert run
        const runResult = await query(
          'INSERT INTO runs (benchmark_id, run_name, model_version) VALUES ($1, $2, $3) RETURNING id',
          [benchmarkId, runName, modelVersion]
        );
        const runId = runResult.rows[0].id;

        // Generate or modify mock data
        let mockData;
        if (rIdx === 0) {
          // First run: generate baseline data
          mockData = generateBenchmarkData(taxonomy, 2000);
          baselineData = mockData;
        } else {
          // Subsequent runs: create variants of baseline data to generate transitions
          mockData = baselineData.map(record => generateTransitionVariant(record, subtypeMap, 0.50));
        }

        const metrics = calculateMetrics(mockData);

        console.log(
          `Inserting ${mockData.length} records for benchmark ${benchmarkId}, run ${runId}`
        );

        // Batch insert results
        const batchSize = 100;
        for (let i = 0; i < mockData.length; i += batchSize) {
          const batch = mockData.slice(i, i + batchSize);
          const values = batch
            .map(
              (record, idx) =>
                `($${idx * 9 + 1}, $${idx * 9 + 2}, $${idx * 9 + 3}, $${idx * 9 + 4}, $${idx * 9 + 5}, $${idx * 9 + 6}, $${idx * 9 + 7}, $${idx * 9 + 8}, $${idx * 9 + 9})`
            )
            .join(',');

          const flatParams = batch.flatMap(r => [
            runId,
            r.request_id,
            JSON.stringify(r.attributes),
            JSON.stringify(r.en_attributes),
            JSON.stringify(r.metadata),
            r.true_type,
            r.pred_type,
            r.true_subtype,
            r.pred_subtype,
          ]);

          await query(
            `INSERT INTO run_results (run_id, request_id, attributes, en_attributes, metadata, true_type, pred_type, true_subtype, pred_subtype)
             VALUES ${values}`,
            flatParams
          );
        }

        // Insert leaderboard metrics
        await query(
          `INSERT INTO leaderboard (run_id, benchmark_id, benchmark_length, subtype_accuracy, subtype_f1_weighted, type_f1_weighted)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            runId,
            benchmarkId,
            metrics.benchmark_length,
            metrics.subtype_accuracy,
            metrics.subtype_f1_weighted,
            metrics.type_f1_weighted,
          ]
        );

        console.log(`✓ Completed run ${runName} for benchmark ${benchmarkId}`);
      }
    }

    console.log('✓ Database seeding completed successfully');
  } catch (error) {
    console.error('Error during seeding:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Execute seeding
seedDatabase().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
