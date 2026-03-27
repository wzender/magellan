import React from 'react';

function BenchmarkDropdown({ benchmarks, selectedBenchmark, onSelect }) {
  return (
    <div className="benchmark-dropdown">
      <label htmlFor="benchmark">Benchmark:</label>
      <select
        id="benchmark"
        value={selectedBenchmark || ''}
        onChange={e => onSelect(parseInt(e.target.value))}
      >
        <option value="">Select a benchmark...</option>
        {benchmarks.map(b => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export default BenchmarkDropdown;