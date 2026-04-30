import React from 'react';

function CalibrationPerTypePanel({ data, runName }) {
  if (!data || data.length === 0) {
    return <div className="calibration-panel">No calibration data available</div>;
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'good':
        return '#4CAF50';
      case 'poor':
        return '#f44336';
      default:
        return '#ff9800';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'good':
        return 'Good';
      case 'poor':
        return 'Poor';
      default:
        return 'Moderate';
    }
  };

  return (
    <div className="calibration-panel">
      <div className="calibration-header">
        <h3>Calibration per Type — {runName}</h3>
        <p className="calibration-subtitle">
          ECE (Expected Calibration Error): lower is better. Brier Score: lower is better (ranges 0-1).
        </p>
      </div>

      <table className="calibration-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Samples</th>
            <th>Accuracy</th>
            <th>Avg Confidence</th>
            <th>ECE</th>
            <th>Brier Score</th>
            <th>Max Gap</th>
            <th>Calibration</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={idx} className={`calibration-row status-${row.status}`}>
              <td className="type-name">{row.type}</td>
              <td className="metric">{row.n}</td>
              <td className="metric">{(row.accuracy * 100).toFixed(1)}%</td>
              <td className="metric">{row.avg_confidence.toFixed(3)}</td>
              <td className="metric metric-ece">{row.ece.toFixed(4)}</td>
              <td className="metric">{row.brier.toFixed(4)}</td>
              <td className="metric">{row.max_gap.toFixed(4)}</td>
              <td>
                <div className="status-badge" style={{ backgroundColor: getStatusColor(row.status) }}>
                  {getStatusLabel(row.status)}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="calibration-legend">
        <div className="legend-item">
          <span className="legend-dot" style={{ backgroundColor: '#4CAF50' }}></span>
          <span>Good: ECE &lt; 0.03</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot" style={{ backgroundColor: '#ff9800' }}></span>
          <span>Moderate: 0.03 ≤ ECE &lt; 0.07</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot" style={{ backgroundColor: '#f44336' }}></span>
          <span>Poor: ECE ≥ 0.07</span>
        </div>
      </div>
    </div>
  );
}

export default CalibrationPerTypePanel;
