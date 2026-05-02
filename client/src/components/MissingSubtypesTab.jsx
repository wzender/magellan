import React, { useState } from 'react';

const STATUS_LABELS = {
  accepted: 'Accepted',
  mapped:   'Mapped',
  rejected: 'Rejected',
};

const STATUS_CLASSES = {
  accepted: 'missing-decision-accepted',
  mapped:   'missing-decision-mapped',
  rejected: 'missing-decision-rejected',
};

function DecisionBadge({ decision }) {
  if (!decision) return <span className="missing-decision-badge missing-decision-unreviewed">Unreviewed</span>;
  const label = STATUS_LABELS[decision.status] || decision.status;
  const cls   = STATUS_CLASSES[decision.status] || '';
  const extra = decision.mapped_to ? ` → ${decision.mapped_to}` : '';
  return <span className={`missing-decision-badge ${cls}`}>{label}{extra}</span>;
}

function RecordRow({ record }) {
  const [expanded, setExpanded] = useState(false);

  const renderJson = (val) => {
    if (!val) return <span className="json-empty">(empty)</span>;
    const obj = typeof val === 'string' ? (() => { try { return JSON.parse(val); } catch { return val; } })() : val;
    return <pre className="json-pretty">{typeof obj === 'object' ? JSON.stringify(obj, null, 2) : String(obj)}</pre>;
  };

  return (
    <div className="missing-record">
      <button className="missing-record-header" onClick={() => setExpanded(e => !e)}>
        <span className="missing-record-id">{record.request_id}</span>
        {record.pred_subtype_1 && (
          <span className="missing-record-stage1">Stage 1: {record.pred_subtype_1}</span>
        )}
        <span className="missing-record-toggle">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="missing-record-detail">
          <div className="missing-record-detail-col">
            <div className="missing-record-detail-label">Attributes</div>
            {renderJson(record.attributes)}
          </div>
          <div className="missing-record-detail-col">
            <div className="missing-record-detail-label">Metadata</div>
            {renderJson(record.metadata)}
          </div>
        </div>
      )}
    </div>
  );
}

function CandidateGroup({ group, countrySubtypes, onDecision }) {
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
          {records.map(r => <RecordRow key={r.request_id} record={r} />)}
        </div>
      )}
    </div>
  );
}

export default function MissingSubtypesTab({ groups, loading, countrySubtypes, onDecision }) {
  const [statusFilter, setStatusFilter] = useState('all');

  if (loading) return <div className="viewer-loading">Loading missing subtypes…</div>;
  if (!groups || groups.length === 0) {
    return <div className="missing-empty">No missing subtype candidates for this run.</div>;
  }

  const unreviewed   = groups.filter(g => !g.decision).length;
  const acceptedCount = groups.filter(g => g.decision?.status === 'accepted').length;
  const mappedCount  = groups.filter(g => g.decision?.status === 'mapped').length;
  const rejectedCount = groups.filter(g => g.decision?.status === 'rejected').length;

  const filtered = statusFilter === 'all'        ? groups
    : statusFilter === 'unreviewed' ? groups.filter(g => !g.decision)
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
