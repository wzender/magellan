import React, { useEffect, useMemo } from 'react';

/* ── helpers ─────────────────────────────────────────────── */
function labelClass(record) {
  if (record.pred_subtype === record.true_subtype) return 'label-correct';
  if (record.pred_type    !== record.true_type)    return 'label-cross-type';
  return 'label-same-type';
}

function labelSeverityText(record) {
  if (record.pred_subtype === record.true_subtype) return null;
  if (record.pred_type !== record.true_type) return 'Cross-type error';
  return 'Same-type error';
}

function renderVal(v) {
  if (v === null || v === undefined) return '—';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/* ── FieldTable ── 3-column: Field | Original | English ──── */
function FieldTable({ orig, en, sectionLabel }) {
  const allKeys = Array.from(
    new Set([...Object.keys(orig || {}), ...Object.keys(en || {})])
  ).filter(k => {
    const v = orig?.[k] ?? en?.[k];
    return v !== null && v !== undefined && v !== '';
  });

  if (!allKeys.length) return null;

  return (
    <>
      <tr className="field-table-section-row">
        <td colSpan={3}>{sectionLabel}</td>
      </tr>
      {allKeys.map(k => (
        <tr key={k}>
          <td className="ft-key">{k}</td>
          <td className="ft-val">{renderVal(orig?.[k])}</td>
          <td className="ft-val ft-en">{renderVal(en?.[k])}</td>
        </tr>
      ))}
    </>
  );
}

/* ── RecordCard ──────────────────────────────────────────── */
function RecordCard({ record, index }) {
  const cls = labelClass(record);
  const severityText = labelSeverityText(record);
  const confidence = record.metadata?.confidence ?? record.en_metadata?.confidence;

  return (
    <div className={`record-card record-card-open ${cls}`}>
      {/* ── label row ── */}
      <div className="record-card-header record-card-header-static">
        <span className="record-index">#{index + 1}</span>
        <div className="record-labels">
          <div className="true-label">
            <span className="label-dim">True</span>
            <span className="label-type">{record.true_type}</span>
            <span className="label-sep">›</span>
            <span className="label-subtype">{record.true_subtype}</span>
          </div>
          <div className={`pred-label pred-label-${cls}`}>
            <span className="label-dim">Predicted</span>
            <span className="label-type">{record.pred_type}</span>
            <span className="label-sep">›</span>
            <span className="label-subtype">{record.pred_subtype}</span>
            {severityText && <span className={`severity-badge severity-${cls}`}>{severityText}</span>}
          </div>
        </div>
        <div className="record-card-meta">
          {confidence && (
            <span className="confidence-chip">{parseFloat(confidence).toFixed(0)}% conf</span>
          )}
          {record.metadata?.region && <span className="meta-chip">{record.metadata.region}</span>}
          {record.metadata?.status  && <span className="meta-chip">{record.metadata.status}</span>}
        </div>
      </div>

      {/* ── unified 3-column table ── */}
      <table className="field-table">
        <thead>
          <tr>
            <th className="ft-head-key">Field</th>
            <th className="ft-head-val">Original</th>
            <th className="ft-head-val">English</th>
          </tr>
        </thead>
        <tbody>
          <FieldTable
            orig={record.attributes}
            en={record.en_attributes}
            sectionLabel="Attributes"
          />
          <FieldTable
            orig={record.metadata}
            en={record.en_metadata}
            sectionLabel="Metadata"
          />
        </tbody>
      </table>
    </div>
  );
}

/* ── BreakdownBar ────────────────────────────────────────── */
function BreakdownBar({ records }) {
  const { correct, sameType, crossType } = useMemo(() => {
    let correct = 0, sameType = 0, crossType = 0;
    records.forEach(r => {
      if (r.pred_subtype === r.true_subtype) correct++;
      else if (r.pred_type !== r.true_type)  crossType++;
      else                                   sameType++;
    });
    return { correct, sameType, crossType };
  }, [records]);

  const total = records.length;
  if (total === 0) return null;

  return (
    <div className="breakdown-bar">
      <div className="breakdown-stats">
        {correct > 0 && (
          <span className="breakdown-stat stat-correct-color">
            <span className="breakdown-dot dot-correct" />
            {correct} correct ({(correct/total*100).toFixed(0)}%)
          </span>
        )}
        {sameType > 0 && (
          <span className="breakdown-stat stat-warn-color">
            <span className="breakdown-dot dot-same-type" />
            {sameType} same-type wrong ({(sameType/total*100).toFixed(0)}%)
          </span>
        )}
        {crossType > 0 && (
          <span className="breakdown-stat stat-danger-color">
            <span className="breakdown-dot dot-cross-type" />
            {crossType} cross-type ({(crossType/total*100).toFixed(0)}%)
          </span>
        )}
      </div>
      <div className="breakdown-track">
        <div className="breakdown-fill fill-correct"    style={{ width: `${correct/total*100}%` }} />
        <div className="breakdown-fill fill-same-type"  style={{ width: `${sameType/total*100}%` }} />
        <div className="breakdown-fill fill-cross-type" style={{ width: `${crossType/total*100}%` }} />
      </div>
    </div>
  );
}

/* ── RecordViewer (inline) ───────────────────────────────── */
function RecordViewer({ title, records, total, loading, onClose }) {
  return (
    <div className="records-section">
      <div className="records-section-header">
        <div className="records-section-title">
          <span>{title}</span>
          {total !== undefined && (
            <span className="record-viewer-count">{total.toLocaleString()} records</span>
          )}
        </div>
        <button className="btn-close-viewer" onClick={onClose}>✕ Clear</button>
      </div>

      {!loading && records && records.length > 0 && (
        <BreakdownBar records={records} />
      )}

      <div className="records-list">
        {loading && <div className="viewer-loading">Loading records…</div>}

        {!loading && records && records.length === 0 && (
          <div className="viewer-empty">No records found.</div>
        )}

        {!loading && records && records.map((r, i) => (
          <RecordCard key={r.id ?? i} record={r} index={i} />
        ))}
      </div>
    </div>
  );
}

export default RecordViewer;
