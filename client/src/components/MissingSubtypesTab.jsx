import React, { useState, useEffect, useRef } from 'react';

/* ── GPT helpers (mirrored from ValidationPanel) ────────────────────────── */
const GPT_VERDICT_CONFIG = {
  truly_unknown:        { label: 'Truly Unknown', cls: 'gpt-verdict-truly-unknown' },
  wrong_subtype:        { label: 'Valid Subtype',  cls: 'gpt-verdict-wrong-subtype' },
  missing_but_mappable: { label: 'Close Subtype',  cls: 'gpt-verdict-mappable' },
  true_missing_subtype: { label: 'True Missing',   cls: 'gpt-verdict-true-missing' },
};

function GptVerdictBadge({ gpt }) {
  if (!gpt) return <span className="gpt-verdict-badge gpt-verdict-unreviewed">Unreviewed</span>;
  if (gpt.error) return <span className="gpt-verdict-badge gpt-verdict-error" title={gpt.error}>Error</span>;
  const cfg = GPT_VERDICT_CONFIG[gpt.decision];
  const badge = cfg
    ? <span className={`gpt-verdict-badge ${cfg.cls}`}>{cfg.label}</span>
    : <span className="gpt-verdict-badge gpt-verdict-unreviewed">{gpt.decision || 'Unreviewed'}</span>;
  const reason = gpt.reason || gpt.text || '';
  return (
    <div className="gpt-verdict-cell">
      {badge}
      {reason && <div className="gpt-verdict-reason">{reason}</div>}
    </div>
  );
}

function normalizeGptResult(value) {
  if (!value) return null;
  let parsedReasoning = null;
  if (typeof value.reasoning === 'string' && value.reasoning.trim().startsWith('{')) {
    try { parsedReasoning = JSON.parse(value.reasoning); } catch {}
  }
  const decision = value.decision || value.subtype || parsedReasoning?.decision || value.verdict || null;
  return {
    text: value.text || '',
    subtype: decision,
    decision,
    mappedAllowedSubtype: value.mapped_allowed_subtype || parsedReasoning?.mapped_allowed_subtype || '',
    suggestedMissingSubtype: value.suggested_missing_subtype || parsedReasoning?.suggested_missing_subtype || '',
    reason: value.reason || parsedReasoning?.reasoning || value.reasoning || '',
    error: value.error || null,
  };
}

function toLegacyYesNo(decision, predictedStatus) {
  const d = String(decision || '').trim();
  const status = String(predictedStatus || '').trim().toLowerCase();
  if (d === 'yes' || d === 'no') return d;
  if (status === 'missing') return d === 'true_missing_subtype' ? 'yes' : 'no';
  return 'no';
}

function getGptSubtype(result) {
  if (!result) return '';
  if (result.decision === 'truly_unknown') return 'unknown';
  return String(result.mappedAllowedSubtype || result.suggestedMissingSubtype || '').trim();
}

function getGptSubtypeSource(result) {
  if (!result) return 'none';
  if (result.decision === 'truly_unknown') return 'truly-unknown';
  const mapped = String(result.mappedAllowedSubtype || '').trim();
  if (mapped.toLowerCase() === 'unknown') return 'truly-unknown';
  if (mapped) return 'mapped';
  if (String(result.suggestedMissingSubtype || '').trim()) return 'suggested';
  return 'none';
}

/* ── Per-record true_subtype badge ───────────────────────────────────────── */
function TrueSubtypeBadge({ trueSubtype }) {
  if (!trueSubtype) return <span className="missing-decision-badge missing-decision-unreviewed">Untagged</span>;
  if (trueSubtype === 'Missing') return <span className="missing-decision-badge missing-decision-mapped">Missing</span>;
  if (trueSubtype === 'unknown') return <span className="missing-decision-badge missing-decision-unknown">Unknown</span>;
  return <span className="missing-decision-badge missing-decision-accepted">{trueSubtype}</span>;
}

/* ── Per-record decision controls (Accept GPT / Map / Missing) ──────────── */
function RecordDecisionControls({ record, gpt, countrySubtypes, onDecision }) {
  const [mappingOpen, setMappingOpen] = useState(false);
  const [mapQuery, setMapQuery]       = useState('');
  const dropdownRef = useRef(null);

  const currentSubtype = record.true_subtype || null;
  const gptProposal    = gpt ? String(gpt.mappedAllowedSubtype || '').trim() : '';
  const allowedSet     = new Set((countrySubtypes || []).map(o => o.subtype).filter(Boolean));
  const gptIsValid     = Boolean(gptProposal && allowedSet.has(gptProposal));

  const subtypeOptions  = [...allowedSet];
  const filteredOptions = mapQuery
    ? subtypeOptions.filter(s => s.toLowerCase().includes(mapQuery.toLowerCase()))
    : subtypeOptions;

  useEffect(() => {
    if (!mappingOpen) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setMappingOpen(false);
        setMapQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [mappingOpen]);

  const handleAcceptGpt = () => {
    onDecision(record.request_id, currentSubtype === gptProposal ? null : gptProposal);
  };

  const handleMap = (subtype) => {
    onDecision(record.request_id, subtype);
    setMappingOpen(false);
    setMapQuery('');
  };

  const handleMissing = () => {
    onDecision(record.request_id, currentSubtype === 'Missing' ? null : 'Missing');
  };

  const handleUnknown = () => {
    onDecision(record.request_id, currentSubtype === 'unknown' ? null : 'unknown');
  };

  const isGptActive      = gptIsValid && currentSubtype === gptProposal;
  const isMissingActive  = currentSubtype === 'Missing';
  const isUnknownActive  = currentSubtype === 'unknown';
  const isMappedActive   = Boolean(currentSubtype && currentSubtype !== 'Missing' && currentSubtype !== 'unknown' && !isGptActive);

  return (
    <div className="missing-group-actions missing-record-actions">
      <button
        className={`missing-action missing-action-accept${isGptActive ? ' active' : ''}`}
        disabled={!gptIsValid}
        onClick={handleAcceptGpt}
        title={gptIsValid ? `Accept GPT proposal: ${gptProposal}` : 'GPT has not proposed a valid allowed subtype'}
      >
        Accept GPT
      </button>

      <div className="missing-action-map-wrap" ref={dropdownRef}>
        <button
          className={`missing-action missing-action-map${isMappedActive ? ' active' : ''}`}
          onClick={() => setMappingOpen(o => !o)}
          title="Map to existing subtype"
        >
          Map {mappingOpen ? '▲' : '▼'}
        </button>
        {mappingOpen && (
          <div className="missing-map-dropdown">
            <input
              className="missing-map-search"
              placeholder="Search subtype…"
              value={mapQuery}
              onChange={e => setMapQuery(e.target.value)}
              autoFocus
            />
            <ul className="missing-map-list">
              {filteredOptions.map(s => (
                <li
                  key={s}
                  className={`missing-map-option${currentSubtype === s ? ' selected' : ''}`}
                  onMouseDown={e => { e.preventDefault(); handleMap(s); }}
                >
                  {s}
                </li>
              ))}
              {filteredOptions.length === 0 && (
                <li className="missing-map-option missing-map-empty">No matches</li>
              )}
            </ul>
          </div>
        )}
      </div>

      <button
        className={`missing-action missing-action-missing${isMissingActive ? ' active' : ''}`}
        onClick={handleMissing}
        title="Tag as genuinely missing subtype"
      >
        Missing
      </button>

      <button
        className={`missing-action missing-action-unknown${isUnknownActive ? ' active' : ''}`}
        onClick={handleUnknown}
        title="Tag as truly unknown"
      >
        Unknown
      </button>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */
const EMPTY_COL_FILTERS = { request_id: '', attributes: '', metadata: '', pred_subtype_1: '' };

export default function MissingSubtypesTab({ runId, groups, loading, countrySubtypes, onDecision, onGptResult }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [colFilters, setColFilters]     = useState(EMPTY_COL_FILTERS);
  const setColFilter = (col, val) => setColFilters(prev => ({ ...prev, [col]: val }));
  const [rowHeight, setRowHeight] = useState('3');
  const [gptRunning, setGptRunning] = useState(false);
  const [gptProgress, setGptProgress] = useState({ done: 0, total: 0 });
  const gptCancelledRef = useRef(false);
  const ROW_HEIGHT_OPTIONS = ['1', '2', '3', 'Auto'];
  const [gptResults, setGptResults] = useState({});
  const [askGptLoading, setAskGptLoading] = useState({});

  useEffect(() => {
    setGptResults({});
    setColFilters(EMPTY_COL_FILTERS);
    if (!runId) return;
    fetch(`/api/gpt-results?run_id=${runId}`)
      .then(r => r.json())
      .then(data => {
        if (!data || typeof data !== 'object') return;
        const mapped = {};
        Object.entries(data).forEach(([requestId, value]) => {
          mapped[requestId] = normalizeGptResult(value);
        });
        setGptResults(mapped);
      })
      .catch(() => {});
  }, [runId]);

  const askGptForRecord = async (record) => {
    const requestId = record.request_id;
    setAskGptLoading(prev => ({ ...prev, [requestId]: true }));

    let result;
    try {
      const allowedSubtypes = (countrySubtypes || []).map(o => o.subtype).filter(Boolean);
      const res = await fetch('/api/ask-gpt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          judge_mode: true,
          attributes: record.attributes,
          metadata: record.metadata,
          predicted_status: 'missing',
          pred_type: record.pred_type || '',
          pred_subtype: record.pred_subtype || '',
          stage2_subtype: 'missing',
          candidate_subtype: record.pred_subtype_1 || '',
          missing_subtype: record.missing_subtype || '',
          allowed_subtypes: allowedSubtypes,
          nearest_subtypes: record.fewshots || record.feshots || [],
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      result = {
        text: data.text || '',
        subtype: data.decision || data.subtype || data.verdict || null,
        decision: data.decision || data.subtype || data.verdict || null,
        mappedAllowedSubtype: data.mapped_allowed_subtype || '',
        suggestedMissingSubtype: data.suggested_missing_subtype || '',
        reason: data.reason || data.reasoning || '',
        error: null,
      };
    } catch (err) {
      result = {
        text: '', subtype: null, decision: null,
        mappedAllowedSubtype: '', suggestedMissingSubtype: '',
        reason: '', error: err.message || '(error)',
      };
    }

    const wasAlreadyReviewed = Boolean(gptResults[requestId]);
    setGptResults(prev => ({ ...prev, [requestId]: result }));
    if (onGptResult) onGptResult(requestId, !wasAlreadyReviewed);

    const legacyVerdict = toLegacyYesNo(result.decision, 'missing');
    const structuredReasoning = JSON.stringify({
      decision: result.decision || '',
      mapped_allowed_subtype: result.mappedAllowedSubtype || '',
      suggested_missing_subtype: result.suggestedMissingSubtype || '',
      reasoning: result.text || result.reason || (result.error ? `Error: ${result.error}` : ''),
    });
    fetch('/api/gpt-results', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id: runId,
        results: { [requestId]: { verdict: legacyVerdict, reasoning: structuredReasoning } },
      }),
    }).catch(() => {});

    setAskGptLoading(prev => ({ ...prev, [requestId]: false }));
  };

  const askGptAll = async (recordsToProcess) => {
    gptCancelledRef.current = false;
    const pending = recordsToProcess.filter(r => !gptResults[r.request_id]);
    if (pending.length === 0) return;
    setGptRunning(true);
    setGptProgress({ done: 0, total: pending.length });
    for (const record of pending) {
      if (gptCancelledRef.current) break;
      await askGptForRecord(record);
      setGptProgress(prev => ({ ...prev, done: prev.done + 1 }));
    }
    setGptRunning(false);
  };

  if (loading) return <div className="viewer-loading">Loading missing subtypes…</div>;
  if (!groups || groups.length === 0) {
    return <div className="missing-empty">No missing subtype candidates for this run.</div>;
  }

  const allRecords = groups.flatMap(g => g.records);
  const totalRecords       = allRecords.length;
  const gptReviewedCount   = allRecords.filter(r => gptResults[r.request_id]).length;
  const gptUnreviewedCount = totalRecords - gptReviewedCount;
  const taggedCount        = allRecords.filter(r => r.true_subtype && r.true_subtype !== 'Missing').length;
  const missingTaggedCount = allRecords.filter(r => r.true_subtype === 'Missing').length;
  const humanDecidedCount  = taggedCount + missingTaggedCount;

  const filtered = allRecords.filter(r => {
    if (statusFilter === 'all')        return true;
    if (statusFilter === 'unreviewed') return !gptResults[r.request_id];
    if (statusFilter === 'tagged')     return r.true_subtype && r.true_subtype !== 'Missing';
    if (statusFilter === 'missing')    return r.true_subtype === 'Missing';
    return true;
  }).filter(r => {
    if (colFilters.request_id    && !r.request_id.toLowerCase().includes(colFilters.request_id.toLowerCase())) return false;
    if (colFilters.attributes    && !JSON.stringify(r.attributes || '').toLowerCase().includes(colFilters.attributes.toLowerCase())) return false;
    if (colFilters.metadata      && !JSON.stringify(r.metadata || '').toLowerCase().includes(colFilters.metadata.toLowerCase())) return false;
    if (colFilters.pred_subtype_1 && !String(r.pred_subtype_1 || '').toLowerCase().includes(colFilters.pred_subtype_1.toLowerCase())) return false;
    return true;
  });

  const tabs = [
    { key: 'all',        label: 'All',       count: totalRecords },
    { key: 'unreviewed', label: 'Unreviewed', count: gptUnreviewedCount },
    { key: 'tagged',     label: 'Tagged',     count: taggedCount },
    { key: 'missing',    label: 'Missing',    count: missingTaggedCount },
  ];

  const renderJson = (val) => {
    if (!val) return <span className="json-empty">(empty)</span>;
    const obj = typeof val === 'string'
      ? (() => { try { return JSON.parse(val); } catch { return val; } })()
      : val;
    return <pre className="json-pretty">{typeof obj === 'object' ? JSON.stringify(obj, null, 2) : String(obj)}</pre>;
  };

  return (
    <div className="missing-subtypes-tab">
      <div className="missing-subtypes-header">
        <div className="missing-verdict-tabs">
          {tabs.map(t => (
            <button
              key={t.key}
              className={`missing-verdict-tab${statusFilter === t.key ? ' active' : ''}`}
              onClick={() => setStatusFilter(t.key)}
            >
              {t.label} <span className="missing-verdict-tab-count">{t.count}</span>
            </button>
          ))}
        </div>
        <div className="validation-retag-stats">
          <span className="validation-progress">{gptReviewedCount}/{totalRecords} reviewed</span>
          <span className="validation-progress">{humanDecidedCount}/{totalRecords} retagged</span>
        </div>
        <div className="gpt-subtype-legend">
          <span className="gpt-subtype-pill is-mapped">existing</span>
          <span className="gpt-subtype-pill is-suggested">missing</span>
          <span className="gpt-subtype-pill is-truly-unknown">unknown</span>
        </div>
        <div className="row-height-control">
          <span className="row-height-label">Row height:</span>
          {ROW_HEIGHT_OPTIONS.map(opt => (
            <button key={opt} className={`row-height-btn${rowHeight === opt ? ' active' : ''}`} onClick={() => setRowHeight(opt)}>{opt}</button>
          ))}
        </div>
        <button
          className={`export-csv-btn ask-gpt-btn${gptRunning ? ' loading' : ''}`}
          onClick={() => askGptAll(filtered)}
          disabled={gptRunning}
        >
          {gptRunning ? `GPT ${gptProgress.done}/${gptProgress.total}…` : 'Ask GPT'}
        </button>
        {gptRunning && (
          <button className="export-csv-btn ask-gpt-cancel-btn" onClick={() => { gptCancelledRef.current = true; }}>
            Cancel
          </button>
        )}
      </div>

      <div className={`validation-table-wrap row-height-${rowHeight.toLowerCase()}`}>
        <table className="validation-table records-table">
          <thead>
            <tr>
              <th style={{ width: 120 }}>Request ID</th>
              <th style={{ width: 200 }}>Attributes</th>
              <th style={{ width: 200 }}>Metadata</th>
              <th style={{ width: 150 }}>Pred Subtype 1</th>
              <th style={{ width: 120 }}>Pred Subtype 2</th>
              <th style={{ width: 220 }}>GPT Verdict</th>
              <th style={{ width: 140 }}>GPT Subtype</th>
              <th style={{ width: 280 }}>True Subtype</th>
            </tr>
            <tr className="col-filter-row">
              <th><input className="col-filter-input" placeholder="filter…" value={colFilters.request_id}    onChange={e => setColFilter('request_id', e.target.value)} /></th>
              <th><input className="col-filter-input" placeholder="filter…" value={colFilters.attributes}    onChange={e => setColFilter('attributes', e.target.value)} /></th>
              <th><input className="col-filter-input" placeholder="filter…" value={colFilters.metadata}      onChange={e => setColFilter('metadata', e.target.value)} /></th>
              <th><input className="col-filter-input" placeholder="filter…" value={colFilters.pred_subtype_1} onChange={e => setColFilter('pred_subtype_1', e.target.value)} /></th>
              <th /><th /><th /><th />
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const gpt = gptResults[r.request_id];
              return (
                <tr key={r.request_id}>
                  <td className="cell-request-id">{r.request_id}</td>
                  <td className="cell-json">{renderJson(r.attributes)}</td>
                  <td className="cell-json">{renderJson(r.metadata)}</td>
                  <td><strong>{r.pred_subtype_1 || '—'}</strong></td>
                  <td><span className="gpt-verdict-badge gpt-verdict-unreviewed">{r.pred_subtype_2 || 'missing'}</span></td>
                  <td className="cell-gpt-verdict">
                    <GptVerdictBadge gpt={gpt} />
                    <button
                      className="ask-gpt-row-btn"
                      disabled={Boolean(askGptLoading[r.request_id])}
                      onClick={() => askGptForRecord(r)}
                    >
                      {askGptLoading[r.request_id] ? 'Asking…' : 'Ask GPT'}
                    </button>
                  </td>
                  <td>
                    {getGptSubtype(gpt) ? (
                      <span className={`gpt-subtype-pill is-${getGptSubtypeSource(gpt)}`}>
                        {getGptSubtype(gpt)}
                      </span>
                    ) : (
                      <span className="gpt-subtype-pill is-empty">—</span>
                    )}
                  </td>
                  <td className="cell-missing-decision">
                    <TrueSubtypeBadge trueSubtype={r.true_subtype} />
                    <RecordDecisionControls
                      record={r}
                      gpt={gpt}
                      countrySubtypes={countrySubtypes}
                      onDecision={onDecision}
                    />
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="missing-empty">No records in this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
