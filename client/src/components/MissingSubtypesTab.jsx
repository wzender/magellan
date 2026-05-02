import React, { useState, useEffect } from 'react';

/* ── GPT helpers (mirrored from ValidationPanel) ────────────────────────── */
const GPT_VERDICT_CONFIG = {
  truly_unknown:        { label: 'Truly Unknown', cls: 'gpt-verdict-truly-unknown' },
  wrong_subtype:        { label: 'Wrong Subtype',  cls: 'gpt-verdict-wrong-subtype' },
  missing_but_mappable: { label: 'Mappable',        cls: 'gpt-verdict-mappable' },
  true_missing_subtype: { label: 'True Missing',    cls: 'gpt-verdict-true-missing' },
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
  if (String(result.mappedAllowedSubtype || '').trim()) return 'mapped';
  if (String(result.suggestedMissingSubtype || '').trim()) return 'suggested';
  return 'none';
}

/* ── Group-level decision badge ─────────────────────────────────────────── */
const STATUS_LABELS  = { accepted: 'Accepted', mapped: 'Mapped', rejected: 'Rejected' };
const STATUS_CLASSES = { accepted: 'missing-decision-accepted', mapped: 'missing-decision-mapped', rejected: 'missing-decision-rejected' };

function DecisionBadge({ decision }) {
  if (!decision) return <span className="missing-decision-badge missing-decision-unreviewed">Unreviewed</span>;
  const label = STATUS_LABELS[decision.status] || decision.status;
  const cls   = STATUS_CLASSES[decision.status] || '';
  const extra = decision.mapped_to ? ` → ${decision.mapped_to}` : '';
  return <span className={`missing-decision-badge ${cls}`}>{label}{extra}</span>;
}

/* ── Record table (ValidationPanel retag-style) ─────────────────────────── */
function GroupRecordTable({ records, gptResults, askGptLoading, onAskGpt }) {
  const renderJson = (val) => {
    if (!val) return <span className="json-empty">(empty)</span>;
    const obj = typeof val === 'string'
      ? (() => { try { return JSON.parse(val); } catch { return val; } })()
      : val;
    return <pre className="json-pretty">{typeof obj === 'object' ? JSON.stringify(obj, null, 2) : String(obj)}</pre>;
  };

  return (
    <div className="missing-record-table-wrap">
      <table className="validation-table records-table">
        <thead>
          <tr>
            <th style={{ width: 120 }}>Request ID</th>
            <th style={{ width: 250 }}>Attributes</th>
            <th style={{ width: 250 }}>Metadata</th>
            <th style={{ width: 170 }}>Pred Subtype 1</th>
            <th style={{ width: 240 }}>GPT Verdict</th>
            <th style={{ width: 160 }}>GPT Subtype</th>
          </tr>
        </thead>
        <tbody>
          {records.map(r => {
            const gpt = gptResults[r.request_id];
            return (
              <tr key={r.request_id}>
                <td className="cell-request-id">{r.request_id}</td>
                <td className="cell-json">{renderJson(r.attributes)}</td>
                <td className="cell-json">{renderJson(r.metadata)}</td>
                <td><strong>{r.pred_subtype_1 || '—'}</strong></td>
                <td className="cell-gpt-verdict">
                  <GptVerdictBadge gpt={gpt} />
                  <button
                    className="ask-gpt-row-btn"
                    disabled={Boolean(askGptLoading[r.request_id])}
                    onClick={() => onAskGpt(r)}
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Candidate group ─────────────────────────────────────────────────────── */
function CandidateGroup({ group, countrySubtypes, gptResults, askGptLoading, onAskGpt, onDecision }) {
  const [expanded, setExpanded] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [mapQuery, setMapQuery] = useState('');

  const subtypeOptions = (countrySubtypes || []).map(o => o.subtype).filter(Boolean);
  const filteredOptions = mapQuery
    ? subtypeOptions.filter(s => s.toLowerCase().includes(mapQuery.toLowerCase()))
    : subtypeOptions;

  const { candidate, count, records, decision } = group;

  const handleMap = (subtype) => {
    onDecision(candidate, 'mapped', subtype);
    setMappingOpen(false);
    setMapQuery('');
  };

  return (
    <div className={`missing-group ${decision ? `missing-group-${decision.status}` : ''}`}>
      <div className="missing-group-header">
        <button className="missing-group-expand" onClick={() => setExpanded(e => !e)}>
          <span className="missing-group-name">{candidate}</span>
          <span className="missing-group-count">{count} {count === 1 ? 'record' : 'records'}</span>
          <DecisionBadge decision={decision} />
          <span className="missing-group-toggle">{expanded ? '▾' : '▸'}</span>
        </button>

        <div className="missing-group-actions">
          <button
            className={`missing-action missing-action-accept${decision?.status === 'accepted' ? ' active' : ''}`}
            onClick={() => onDecision(candidate, decision?.status === 'accepted' ? null : 'accepted', null)}
            title="Accept as new subtype"
          >
            Accept
          </button>

          <div className="missing-action-map-wrap">
            <button
              className={`missing-action missing-action-map${decision?.status === 'mapped' ? ' active' : ''}`}
              onClick={() => setMappingOpen(o => !o)}
              title="Map to existing subtype"
            >
              Map to existing {mappingOpen ? '▲' : '▼'}
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
                      className={`missing-map-option${decision?.mapped_to === s ? ' selected' : ''}`}
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
            className={`missing-action missing-action-reject${decision?.status === 'rejected' ? ' active' : ''}`}
            onClick={() => onDecision(candidate, decision?.status === 'rejected' ? null : 'rejected', null)}
            title="Reject — classifier error"
          >
            Reject
          </button>
        </div>
      </div>

      {expanded && (
        <div className="missing-group-records">
          <GroupRecordTable
            records={records}
            gptResults={gptResults}
            askGptLoading={askGptLoading}
            onAskGpt={onAskGpt}
          />
        </div>
      )}
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */
export default function MissingSubtypesTab({ runId, groups, loading, countrySubtypes, onDecision }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [gptResults, setGptResults] = useState({});
  const [askGptLoading, setAskGptLoading] = useState({});

  useEffect(() => {
    setGptResults({});
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

    setGptResults(prev => ({ ...prev, [requestId]: result }));

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

  if (loading) return <div className="viewer-loading">Loading missing subtypes…</div>;
  if (!groups || groups.length === 0) {
    return <div className="missing-empty">No missing subtype candidates for this run.</div>;
  }

  const unreviewed    = groups.filter(g => !g.decision).length;
  const acceptedCount = groups.filter(g => g.decision?.status === 'accepted').length;
  const mappedCount   = groups.filter(g => g.decision?.status === 'mapped').length;
  const rejectedCount = groups.filter(g => g.decision?.status === 'rejected').length;

  const filtered = statusFilter === 'all'
    ? groups
    : statusFilter === 'unreviewed'
    ? groups.filter(g => !g.decision)
    : groups.filter(g => g.decision?.status === statusFilter);

  const tabs = [
    { key: 'all',        label: 'All',        count: groups.length },
    { key: 'unreviewed', label: 'Unreviewed',  count: unreviewed },
    { key: 'accepted',   label: 'Accepted',    count: acceptedCount },
    { key: 'mapped',     label: 'Mapped',      count: mappedCount },
    { key: 'rejected',   label: 'Rejected',    count: rejectedCount },
  ];

  return (
    <div className="missing-subtypes-tab">
      <div className="missing-subtypes-header">
        <div className="missing-subtypes-summary">
          <span className="missing-summary-total">{groups.length} candidates</span>
          <span className="missing-summary-dot">·</span>
          <span className="missing-summary-reviewed">{groups.length - unreviewed} reviewed</span>
        </div>
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
      </div>

      <div className="missing-group-list">
        {filtered.map(g => (
          <CandidateGroup
            key={g.candidate}
            group={g}
            countrySubtypes={countrySubtypes}
            gptResults={gptResults}
            askGptLoading={askGptLoading}
            onAskGpt={askGptForRecord}
            onDecision={onDecision}
          />
        ))}
        {filtered.length === 0 && (
          <div className="missing-empty">No candidates in this filter.</div>
        )}
      </div>
    </div>
  );
}
