/**
 * Export Database Data to CSV
 * Queries the database and writes data to CSV files
 */

const fs = require('fs');
const path = require('path');
const { stringify } = require('csv-stringify/sync');
const dbLoader = require('./db-loader');

async function exportToCSV() {
  const dataDir = path.join(__dirname, '../data');

  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  try {
    console.log('Exporting database data to CSV...');

    // Export benchmarks
    const benchmarks = await dbLoader.getAllBenchmarks();
    const benchmarkCsv = stringify(benchmarks, { header: true });
    fs.writeFileSync(path.join(dataDir, 'benchmarks.csv'), benchmarkCsv);
    console.log(`✓ Exported ${benchmarks.length} benchmarks`);

    // Export runs
    const runs = [];
    for (const benchmark of benchmarks) {
      const benchmarkRuns = await dbLoader.getRunsByBenchmarkId(benchmark.id);
      runs.push(...benchmarkRuns);
    }
    const runsCsv = stringify(runs, { header: true });
    fs.writeFileSync(path.join(dataDir, 'runs.csv'), runsCsv);
    console.log(`✓ Exported ${runs.length} runs`);

    // Export leaderboard
    const leaderboard = [];
    for (const benchmark of benchmarks) {
      const benchmarkLeaderboard = await dbLoader.getLeaderboardByBenchmarkId(benchmark.id);
      leaderboard.push(...benchmarkLeaderboard);
    }
    const leaderboardCsv = stringify(leaderboard, { header: true });
    fs.writeFileSync(path.join(dataDir, 'leaderboard.csv'), leaderboardCsv);
    console.log(`✓ Exported ${leaderboard.length} leaderboard entries`);

    // Export run_results (assuming there's a function)
    // For now, create empty or skip if not implemented
    const runResultsCsv = 'id,run_id,true_type,true_subtype,pred_type,pred_subtype,attributes\n';
    fs.writeFileSync(path.join(dataDir, 'run_results.csv'), runResultsCsv);
    console.log('✓ Created empty run_results.csv (implement if needed)');

    console.log('✓ Export completed successfully');
  } catch (error) {
    console.error('Error exporting to CSV:', error);
  }
}

exportToCSV();