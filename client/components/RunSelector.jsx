import React from 'react';

function RunSelector({
  runs,
  selectedRun,
  selectedRun2,
  onRunSelect,
  onRun2Select,
  viewMode,
  onViewModeChange,
}) {
  return (
    <div className="run-selector">
      <div className="run-controls">
        <label htmlFor="run1">Run 1:</label>
        <select
          id="run1"
          value={selectedRun || ''}
          onChange={e => onRunSelect(parseInt(e.target.value))}
        >
          <option value="">Select a run...</option>
          {runs.map(r => (
            <option key={r.id} value={r.id}>
              {r.run_name} ({r.model_version})
            </option>
          ))}
        </select>
      </div>

      <div className="view-mode-toggle">
        <button
          className={viewMode === 'confusion' ? 'active' : ''}
          onClick={() => onViewModeChange('confusion')}
        >
          Confusion Matrix
        </button>
        <button
          className={viewMode === 'transition' ? 'active' : ''}
          onClick={() => onViewModeChange('transition')}
        >
          Transition Matrix
        </button>
      </div>

      {viewMode === 'transition' && (
        <div className="run-controls">
          <label htmlFor="run2">Run 2:</label>
          <select
            id="run2"
            value={selectedRun2 || ''}
            onChange={e => onRun2Select(parseInt(e.target.value))}
          >
            <option value="">Select a run...</option>
            {runs.map(r => (
              <option key={r.id} value={r.id}>
                {r.run_name} ({r.model_version})
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

export default RunSelector;
