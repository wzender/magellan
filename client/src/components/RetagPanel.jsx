import React, { useState } from 'react';
import * as XLSX from 'xlsx';

const ROW_HEIGHT_OPTIONS = ['1', '2', '3', 'Auto'];

function parseJsonValue(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch {
      try { obj = JSON.parse(raw.replace(/'/g, '"')); } catch { /* keep as string */ }
    }
  }
  return obj;
}

function RetagPanel({ retagList, allSubtypes, onSetSubtype, onRemove, onClear }) {
  const [rowHeight, setRowHeight] = useState('3');

  if (retagList.length === 0) {
    return (
      <div className="retag-empty">
        No records added yet. In Matrix View or Error Explorer, click <strong>Add to Retag</strong> on any record row.
      </div>
    );
  }

  const exportToCsv = () => {
    const headers = ['request_id', 'true_subtype', 'pred_subtype', 'retag_subtype', 'attributes', 'metadata'];
    const rows = retagList.map(({ record, retag_subtype }) => [
      record.request_id,
      record.true_subtype,
      record.pred_subtype,
      retag_subtype || '',
      JSON.stringify(record.attributes ?? ''),
      JSON.stringify(record.metadata ?? ''),
    ]);
    const csv = [headers.join(','), ...rows.map(r =>
      r.map(v => {
        const s = String(v ?? '');
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(',')
    )].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'retag_records.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToExcel = () => {
    const headers = ['request_id', 'true_subtype', 'pred_subtype', 'retag_subtype', 'attributes', 'metadata'];
    const rows = retagList.map(({ record, retag_subtype }) => [
      record.request_id,
      record.true_subtype,
      record.pred_subtype,
      retag_subtype || '',
      JSON.stringify(record.attributes ?? ''),
      JSON.stringify(record.metadata ?? ''),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Retag');
    XLSX.writeFile(wb, 'retag_records.xlsx');
  };

  const taggedCount = retagList.filter(r => r.retag_subtype).length;

  return (
    <div className="retag-panel">
      <div className="retag-toolbar">
        <span className="retag-count">
          {retagList.length} records
          {taggedCount > 0 && (
            <span className="retag-tagged-badge">{taggedCount} tagged</span>
          )}
        </span>
        <div className="retag-toolbar-actions">
          <div className="row-height-control">
            <span className="row-height-label">Row height:</span>
            {ROW_HEIGHT_OPTIONS.map(opt => (
              <button
                key={opt}
                className={`row-height-btn${rowHeight === opt ? ' active' : ''}`}
                onClick={() => setRowHeight(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
          <button className="export-csv-btn" onClick={exportToCsv} title="Export retagged records to CSV">
            Export to CSV
          </button>
          <button className="export-csv-btn" onClick={exportToExcel} title="Export retagged records to Excel">
            Export to Excel
          </button>
          <button className="retag-clear-btn" onClick={onClear} title="Remove all records from retag list">
            Clear All
          </button>
        </div>
      </div>

      <div className="retag-table-wrapper">
        <table className={`retag-table row-height-${rowHeight.toLowerCase()}`}>
          <thead>
            <tr>
              <th>Request ID</th>
              <th>True Subtype</th>
              <th>Pred Subtype</th>
              <th>Retag Subtype</th>
              <th>Attributes</th>
              <th>Metadata</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {retagList.map(({ record, retag_subtype }) => {
              const isError = record.pred_subtype !== record.true_subtype;
              return (
                <tr key={record.request_id} className={retag_subtype ? 'retag-row-tagged' : ''}>
                  <td className="retag-id-cell">
                    <span className={`correctness-badge ${isError ? 'badge-incorrect' : 'badge-correct'}`} title={isError ? 'Incorrect prediction' : 'Correct prediction'} />
                    <span className="retag-request-id">{record.request_id}</span>
                  </td>
                  <td>{record.true_subtype}</td>
                  <td className={isError ? 'retag-pred-wrong' : ''}>{record.pred_subtype}</td>
                  <td>
                    <select
                      className="retag-subtype-select"
                      value={retag_subtype || ''}
                      onChange={e => onSetSubtype(record.request_id, e.target.value)}
                    >
                      <option value="">— select —</option>
                      {allSubtypes.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="json-td">
                    {(() => {
                      const obj = parseJsonValue(record.attributes);
                      const isEmpty = !obj || (typeof obj === 'object' ? Object.keys(obj).length === 0 : String(obj).trim() === '');
                      return isEmpty
                        ? <div className="json-empty">(empty)</div>
                        : <pre className="json-pretty">{typeof obj === 'object' ? JSON.stringify(obj, null, 2) : String(obj)}</pre>;
                    })()}
                  </td>
                  <td className="json-td">
                    {(() => {
                      const obj = parseJsonValue(record.metadata);
                      const isEmpty = !obj || (typeof obj === 'object' ? Object.keys(obj).length === 0 : String(obj).trim() === '');
                      return isEmpty
                        ? <div className="json-empty">(empty)</div>
                        : <pre className="json-pretty">{typeof obj === 'object' ? JSON.stringify(obj, null, 2) : String(obj)}</pre>;
                    })()}
                  </td>
                  <td>
                    <button
                      className="retag-remove-btn"
                      onClick={() => onRemove(record.request_id)}
                      title="Remove from retag list"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default RetagPanel;
