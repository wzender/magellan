import React from 'react';

function BenchmarkGallery({ benchmarks, allLeaderboards, onSelect }) {
  return (
    <div className="gallery-screen">
      <div className="gallery-hero">
        <h2 className="gallery-title">Classification Benchmarks</h2>
        <p className="gallery-subtitle">Select a benchmark to explore model performance</p>
      </div>
      <div className="gallery-grid">
        {benchmarks.map(b => {
          const runs = allLeaderboards[b.id] || [];
          const champion = runs[0];
          const champAcc = champion ? (champion.subtype_accuracy * 100).toFixed(1) : null;
          return (
            <button key={b.id} className="benchmark-card" onClick={() => onSelect(b)}>
              <div className="benchmark-card-top">
                <span className="benchmark-card-name">{b.name}</span>
                <span className="benchmark-card-run-count">{runs.length} run{runs.length !== 1 ? 's' : ''}</span>
              </div>
              {champion && (
                <div className="benchmark-card-champion">
                  <span className="badge badge-gold">Champion</span>
                  <span className="champion-model">{champion.run_name}</span>
                  <span className="champion-accuracy">{champAcc}%</span>
                </div>
              )}
              {champion && (
                <div className="benchmark-card-bar-wrap">
                  <div
                    className="benchmark-card-bar-fill"
                    style={{ width: `${Math.max(champAcc, 2)}%` }}
                  />
                </div>
              )}
              <div className="benchmark-card-footer">
                {champion && (
                  <span className="benchmark-card-records">
                    {champion.benchmark_length?.toLocaleString()} records
                  </span>
                )}
                <span className="benchmark-card-cta">Explore &rarr;</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default BenchmarkGallery;
