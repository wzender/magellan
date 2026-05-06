import React from 'react';

function ProgressBars({ gptReviewed, humanTagged, total }) {
  const safeTotal = total || 1;
  const gptPct   = Math.min(100, Math.round((gptReviewed   / safeTotal) * 100));
  const humanPct = Math.min(100, Math.round((humanTagged   / safeTotal) * 100));
  return (
    <div className="progress-bars">
      <div className="progress-bar-row">
        <span className="progress-label">GPT</span>
        <div className="progress-track">
          <div className="progress-fill gpt" style={{ width: `${gptPct}%` }} />
        </div>
        <span className="progress-count">{gptReviewed}/{total}</span>
      </div>
      <div className="progress-bar-row">
        <span className="progress-label">Human</span>
        <div className="progress-track">
          <div className="progress-fill human" style={{ width: `${humanPct}%` }} />
        </div>
        <span className="progress-count">{humanTagged}/{total}</span>
      </div>
    </div>
  );
}

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
            <th>Subtype F1 (Weighted)</th>
            <th>Type F1 (Weighted)</th>
            <th>Benchmark Size</th>
            <th>Tagging Progress</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={row.run_id}>
              <td className="rank">{idx + 1}</td>
              <td className="run-name">{row.run_name}</td>
              <td>{row.model_version || '-'}</td>
              <td className="metric">{parseFloat(row.subtype_weighted_f1).toFixed(4)}</td>
              <td className="metric">{parseFloat(row.type_weighted_f1).toFixed(4)}</td>
              <td className="benchmark-size">{row.benchmark_length}</td>
              <td className="progress-cell">
                <ProgressBars
                  gptReviewed={row.gpt_reviewed || 0}
                  humanTagged={row.human_tagged || 0}
                  total={row.benchmark_length || 0}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default LeaderboardWidget;
