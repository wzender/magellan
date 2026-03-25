import React from 'react';

function LeaderboardWidget({ data }) {
  if (!data || data.length === 0) {
    return <div className="leaderboard-widget">No leaderboard data available</div>;
  }

  return (
    <div className="leaderboard-widget">
      <h2>Leaderboard</h2>
      <table className="leaderboard-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Run</th>
            <th>Model Version</th>
            <th>Subtype Accuracy</th>
            <th>Subtype F1 (Weighted)</th>
            <th>Type F1 (Weighted)</th>
            <th>Benchmark Size</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={row.run_id}>
              <td className="rank">{idx + 1}</td>
              <td className="run-name">{row.run_name}</td>
              <td>{row.model_version || '-'}</td>
              <td className="metric">{parseFloat(row.subtype_accuracy).toFixed(4)}</td>
              <td className="metric">{parseFloat(row.subtype_f1_weighted).toFixed(4)}</td>
              <td className="metric">{parseFloat(row.type_f1_weighted).toFixed(4)}</td>
              <td className="benchmark-size">{row.benchmark_length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default LeaderboardWidget;
