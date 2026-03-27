import React from 'react';

function RunSelector({
  runs,
  selectedRuns = [],
  onRunToggle,
}) {
  return (
    <div className="run-selector">
      <div className="run-selection">
        <label>Select Runs (1-2):</label>
        <div className="run-checkboxes">
          {runs.map(r => (
            <label key={r.id} className="run-checkbox">
              <input
                type="checkbox"
                checked={selectedRuns.includes(r.id)}
                onChange={() => onRunToggle(r.id)}
                disabled={selectedRuns.length >= 2 && !selectedRuns.includes(r.id)}
              />
              {r.run_name} ({r.model_version})
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

export default RunSelector;