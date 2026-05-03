import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import * as XLSX from 'xlsx';

/* ── True Subtype badge (same styling as MissingSubtypesTab) ─────────────── */
function TrueSubtypeBadge({ verdict }) {
  if (!verdict) return <span className="missing-decision-badge missing-decision-unreviewed">Untagged</span>;
  if (verdict === 'Missing') return <span className="missing-decision-badge missing-decision-mapped">Missing</span>;
  if (verdict === 'unknown') return <span className="missing-decision-badge missing-decision-unknown">Unknown</span>;
  return <span className="missing-decision-badge missing-decision-accepted">{verdict}</span>;
}

/* ── Per-record decision controls (Accept GPT / Map / Missing) ──────────── */
function ValidationRecordDecisionControls({ requestId, verdict, gpt, countrySubtypes, onSetVerdict }) {
  const [mappingOpen, setMappingOpen] = useState(false);
  const [mapQuery, setMapQuery]       = useState('');
  const dropdownRef = useRef(null);

  const gptMapped      = gpt ? String(gpt.mappedAllowedSubtype || '').trim() : '';
  const allowedSet     = new Set((countrySubtypes || []).map(o => o.subtype).filter(Boolean));
  let gptSuggestedVerdict = '';
  if (gpt) {
    if (gpt.decision === 'truly_unknown' || gptMapped.toLowerCase() === 'unknown') {
      gptSuggestedVerdict = 'unknown';
    } else if (gptMapped && allowedSet.has(gptMapped)) {
      gptSuggestedVerdict = gptMapped;
    } else if (String(gpt.suggestedMissingSubtype || '').trim()) {
      gptSuggestedVerdict = 'Missing';
    }
  }
  const gptIsValid     = Boolean(gptSuggestedVerdict);
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

  const commit = (val) => onSetVerdict(requestId, val || '');
  const handleAcceptGpt = () => commit(verdict === gptSuggestedVerdict ? '' : gptSuggestedVerdict);
  const handleMap = (subtype) => { commit(subtype); setMappingOpen(false); setMapQuery(''); };
  const handleMissing = () => commit(verdict === 'Missing' ? '' : 'Missing');
  const handleUnknown = () => commit(verdict === 'unknown' ? '' : 'unknown');

  const isGptActive     = gptIsValid && verdict === gptSuggestedVerdict;
  const isMissingActive = verdict === 'Missing';
  const isUnknownActive = verdict === 'unknown';
  const isMappedActive  = Boolean(verdict && verdict !== 'Missing' && verdict !== 'unknown' && !isGptActive);

  return (
    <div className="missing-group-actions missing-record-actions">
      <button
        className={`missing-action missing-action-accept${isGptActive ? ' active' : ''}`}
        disabled={!gptIsValid}
        onClick={handleAcceptGpt}
        title={gptIsValid
          ? `Accept GPT: ${gptSuggestedVerdict === 'unknown' ? 'unknown (weak signal)' : gptSuggestedVerdict === 'Missing' ? `missing – "${String(gpt.suggestedMissingSubtype || '').trim()}"` : gptSuggestedVerdict}`
          : 'No GPT review available'}
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
                  className={`missing-map-option${verdict === s ? ' selected' : ''}`}
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

const VERDICTS = [
  { value: 'justified', label: 'Justified', className: 'verdict-justified' },
  { value: 'unjustified', label: 'Not Justified', className: 'verdict-unjustified' },
  { value: 'unclear', label: 'Unclear', className: 'verdict-unclear' },
];

const EMPTY_COL_FILTERS = { request_id: '', pred_subtype: '', attributes: '', metadata: '' };

const GPT_VERDICT_CONFIG = {
  truly_unknown:        { label: 'Truly Unknown',   cls: 'gpt-verdict-truly-unknown' },
  wrong_subtype:        { label: 'Valid Subtype',    cls: 'gpt-verdict-wrong-subtype' },
  missing_but_mappable: { label: 'Close Subtype',    cls: 'gpt-verdict-mappable' },
  true_missing_subtype: { label: 'True Missing',     cls: 'gpt-verdict-true-missing' },
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
const NOT_RETAGGED_LABEL = 'Not retagged';

function getAskText(result) {
  if (!result) return 'Prompt output will appear here';
  if (result.error) return `Error: ${result.error}`;
  if (result.text) return result.text;
  if (result.subtype || result.reason) {
    const subtype = result.subtype ? `SUBTYPE: ${result.subtype}` : '';
    const reason = result.reason ? `REASON: ${result.reason}` : '';
    return [subtype, reason].filter(Boolean).join(' | ');
  }
  return 'No response text';
}

function normalizeGptResult(value) {
  if (!value) return null;

  let parsedReasoning = null;
  if (typeof value.reasoning === 'string' && value.reasoning.trim().startsWith('{')) {
    try {
      parsedReasoning = JSON.parse(value.reasoning);
    } catch {
      parsedReasoning = null;
    }
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

  if (status === 'unknown') {
    return d === 'truly_unknown' ? 'no' : 'yes';
  }
  if (status === 'missing') {
    return d === 'true_missing_subtype' ? 'yes' : 'no';
  }

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

function ValidationPanel({ runId, runName, country, countrySubtypes, records, verdicts, gridFilter, onClearGridFilter, onSetVerdict, onBulkVerdict, onGptResultsUpdated }) {
  const isRetag = Boolean(country && countrySubtypes && countrySubtypes.length > 0);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [rowHeight, setRowHeight] = useState('3');
  const [colFilters, setColFilters] = useState(EMPTY_COL_FILTERS);
  const [verdictFilter, setVerdictFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [attrLang, setAttrLang] = useState('original');
  const [metaLang, setMetaLang] = useState('original');
  const [toast, setToast] = useState(null);
  const [copiedCell, setCopiedCell] = useState(null);
  const [gptResults, setGptResults] = useState({});   // request_id -> { verdict, reasoning }
  const [gptRunning, setGptRunning] = useState(false);
  const [gptProgress, setGptProgress] = useState({ done: 0, total: 0 });
  const [askGptLoading, setAskGptLoading] = useState({});
  const gptCancelledRef = useRef(false);
  const toolbarRef = useRef(null);
  const panelRef = useRef(null);

  const PAGE_SIZE_OPTIONS = [20, 50, 'All'];
  const ROW_HEIGHT_OPTIONS = ['1', '2', '3', 'Auto'];

  useLayoutEffect(() => {
    const tb = toolbarRef.current;
    const panel = panelRef.current;
    if (!tb || !panel) return;
    panel.style.setProperty('--table-toolbar-h', `${tb.getBoundingClientRect().height}px`);
  });

  useEffect(() => {
    setCurrentPage(0);
    setSelectedIds(new Set());
    setGptResults({});
    setGptRunning(false);
    setAskGptLoading({});
    setColFilters(EMPTY_COL_FILTERS);
    if (runId) {
      fetch(`/api/gpt-results?run_id=${runId}`)
        .then(r => r.json())
        .then(data => {
          if (!data || typeof data !== 'object') return setGptResults({});
          const mapped = {};
          Object.entries(data).forEach(([requestId, value]) => {
            mapped[requestId] = normalizeGptResult(value);
          });
          setGptResults(mapped);
        })
        .catch(() => {});
    }
  }, [runId]);

  useEffect(() => {
    setCurrentPage(0);
  }, [verdictFilter, JSON.stringify(colFilters)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!records || records.length === 0) {
    return <div className="validation-empty">No records for this run.</div>;
  }

  const subtypeToType = Object.fromEntries((countrySubtypes || []).map(o => [o.subtype, o.type]));
  const hasGridFilter = Boolean(
    gridFilter &&
    (gridFilter.trueType !== null || gridFilter.trueSubtype !== null || gridFilter.predSubtype !== null)
  );
  const gridFilterParts = [];
  if (gridFilter?.trueType) gridFilterParts.push(`Type: ${gridFilter.trueType}`);
  if (gridFilter?.trueSubtype !== null && gridFilter?.trueSubtype !== undefined) {
    gridFilterParts.push(`Subtype: ${gridFilter.trueSubtype === '' ? NOT_RETAGGED_LABEL : gridFilter.trueSubtype}`);
  }
  if (gridFilter?.predSubtype === '__cross_type__') {
    gridFilterParts.push('Pred: Cross-type');
  } else if (gridFilter?.predSubtype) {
    gridFilterParts.push(`Pred: ${gridFilter.predSubtype}`);
  }
  const gridFilterLabel = gridFilterParts.join(' | ');

  /* ── filtering ── */
  let filtered = records;
  if (gridFilter && (gridFilter.trueType !== null || gridFilter.trueSubtype !== null || gridFilter.predSubtype !== null)) {
    filtered = filtered.filter(r => {
      const trueSubtype = verdicts[r.request_id] ?? '';
      const trueType = trueSubtype === '' ? NOT_RETAGGED_LABEL : (subtypeToType[trueSubtype] || '');

      if (gridFilter.trueType !== null && gridFilter.trueType !== undefined && trueType !== gridFilter.trueType) return false;
      if (gridFilter.trueSubtype !== null && gridFilter.trueSubtype !== undefined && trueSubtype !== gridFilter.trueSubtype) return false;
      if (gridFilter.predSubtype === '__cross_type__' && r.pred_type === trueType) return false;
      if (gridFilter.predSubtype && gridFilter.predSubtype !== '__cross_type__' && r.pred_subtype !== gridFilter.predSubtype) return false;
      return true;
    });
  }
  if (colFilters.request_id)   filtered = filtered.filter(r => r.request_id.toLowerCase().includes(colFilters.request_id.toLowerCase()));
  if (colFilters.pred_subtype) {
    filtered = filtered.filter(r => {
      const stage1 = String(r.pred_subtype_1 || r.pred_subtype || '').toLowerCase();
      return stage1.includes(colFilters.pred_subtype.toLowerCase());
    });
  }
  if (colFilters.attributes)   filtered = filtered.filter(r => JSON.stringify(r.attributes || '').toLowerCase().includes(colFilters.attributes.toLowerCase()));
  if (colFilters.metadata)     filtered = filtered.filter(r => JSON.stringify(r.metadata || '').toLowerCase().includes(colFilters.metadata.toLowerCase()));
  if (verdictFilter !== 'all') {
    if (verdictFilter === 'unreviewed') {
      filtered = filtered.filter(r => !gptResults[r.request_id] && !verdicts[r.request_id]);
    } else if (isRetag && verdictFilter === 'unknown') {
      filtered = filtered.filter(r => (r.pred_subtype_2 || '') === 'unknown');
    } else if (isRetag && verdictFilter === 'missing') {
      filtered = filtered.filter(r => (r.pred_subtype_2 || '') === 'missing');
    } else if (isRetag && verdictFilter === 'real_unknown') {
      filtered = filtered.filter(r => gptResults[r.request_id]?.decision === 'truly_unknown');
    } else if (isRetag && verdictFilter === 'real_missing') {
      filtered = filtered.filter(r => gptResults[r.request_id]?.decision === 'true_missing_subtype');
    } else if (isRetag && verdictFilter === 'false_unknown') {
      filtered = filtered.filter(r => {
        const d = gptResults[r.request_id]?.decision;
        return d === 'wrong_subtype' || d === 'missing_but_mappable';
      });
    } else if (isRetag && verdictFilter === 'false_missing') {
      filtered = filtered.filter(r => {
        const isPredMissing = (r.pred_subtype_2 || '') === 'missing';
        const gptResult = gptResults[r.request_id];
        return isPredMissing && gptResult && (gptResult.decision === 'missing_but_mappable' || gptResult.decision === 'wrong_subtype');
      });
    } else if (isRetag && verdictFilter === 'truly_unknown') {
      filtered = filtered.filter(r => gptResults[r.request_id]?.decision === 'truly_unknown');
    } else if (isRetag && verdictFilter === 'true_missing_subtype') {
      filtered = filtered.filter(r => gptResults[r.request_id]?.decision === 'true_missing_subtype');
    } else if (isRetag && verdictFilter === 'missing_but_mappable') {
      filtered = filtered.filter(r => gptResults[r.request_id]?.decision === 'missing_but_mappable');
    } else if (isRetag && verdictFilter === 'wrong_subtype') {
      filtered = filtered.filter(r => gptResults[r.request_id]?.decision === 'wrong_subtype');
    } else {
      filtered = filtered.filter(r => verdicts[r.request_id] === verdictFilter);
    }
  }

  /* ── sorting ── */
  if (sortConfig.key) {
    filtered = [...filtered].sort((a, b) => {
      let aVal, bVal;
      if (sortConfig.key === 'verdict') {
        aVal = verdicts[a.request_id] || '';
        bVal = verdicts[b.request_id] || '';
      } else if (sortConfig.key === 'true_type') {
        const aSub = verdicts[a.request_id] || '';
        const bSub = verdicts[b.request_id] || '';
        aVal = aSub === '' ? NOT_RETAGGED_LABEL : (subtypeToType[aSub] || 'Unknown');
        bVal = bSub === '' ? NOT_RETAGGED_LABEL : (subtypeToType[bSub] || 'Unknown');
      } else if (sortConfig.key === 'missing_subtype') {
        aVal = a.missing_subtype || '';
        bVal = b.missing_subtype || '';
      } else if (sortConfig.key === 'pred_subtype_1') {
        aVal = a.pred_subtype_1 || a.pred_subtype || '';
        bVal = b.pred_subtype_1 || b.pred_subtype || '';
      } else if (sortConfig.key === 'pred_subtype_2') {
        aVal = a.pred_subtype_2 || '';
        bVal = b.pred_subtype_2 || '';
      } else if (sortConfig.key === 'gpt_verdict') {
        aVal = gptResults[a.request_id]?.decision || '';
        bVal = gptResults[b.request_id]?.decision || '';
      } else if (sortConfig.key === 'feshots') {
        aVal = (a.feshots || a.fewshots || []).join(', ');
        bVal = (b.feshots || b.fewshots || []).join(', ');
      } else if (sortConfig.key === 'ask_gpt') {
        aVal = getAskText(gptResults[a.request_id]);
        bVal = getAskText(gptResults[b.request_id]);
      } else if (sortConfig.key === 'gpt_subtype') {
        aVal = getGptSubtype(gptResults[a.request_id]);
        bVal = getGptSubtype(gptResults[b.request_id]);
      } else {
        aVal = a[sortConfig.key] ?? '';
        bVal = b[sortConfig.key] ?? '';
      }
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  const effectivePageSize = pageSize === 'All' ? filtered.length : pageSize;
  const pageData = filtered.slice(currentPage * effectivePageSize, (currentPage + 1) * effectivePageSize);
  const totalPages = pageSize === 'All' ? 1 : Math.ceil(filtered.length / effectivePageSize);

  /* ── stats ── */
  const total = records.length;
  const reviewed = records.filter(r => verdicts[r.request_id]).length;
  const justifiedCount   = records.filter(r => verdicts[r.request_id] === 'justified').length;
  const unjustifiedCount = records.filter(r => verdicts[r.request_id] === 'unjustified').length;
  const unclearCount     = records.filter(r => verdicts[r.request_id] === 'unclear').length;

  /* Unknowns-mode specific stats (gpt-verdict based) */
  const gptReviewedCount  = records.filter(r => gptResults[r.request_id]).length;
  const retaggedCount     = records.filter(r => verdicts[r.request_id]).length;
  const anyReviewedCount  = records.filter(r => gptResults[r.request_id] || verdicts[r.request_id]).length;
  const realUnknownCount  = records.filter(r => gptResults[r.request_id]?.decision === 'truly_unknown').length;
  const falseUnknownCount = records.filter(r => ['wrong_subtype', 'missing_but_mappable'].includes(gptResults[r.request_id]?.decision)).length;
  const retaggedProgress  = total > 0 ? Math.round((anyReviewedCount / total) * 100) : 0;

  /* ── bulk ── */
  const allPageSelected = pageData.length > 0 && pageData.every(r => selectedIds.has(r.request_id));

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allPageSelected) pageData.forEach(r => next.delete(r.request_id));
      else pageData.forEach(r => next.add(r.request_id));
      return next;
    });
  };

  const toggleSelect = (requestId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(requestId)) next.delete(requestId);
      else next.add(requestId);
      return next;
    });
  };

  const handleBulkVerdict = (verdict) => {
    if (selectedIds.size === 0) return;
    const bulk = {};
    selectedIds.forEach(id => { bulk[id] = verdict; });
    onBulkVerdict(bulk);
    setSelectedIds(new Set());
  };

  /* ── sort ── */
  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const sortIndicator = (key) => {
    if (sortConfig.key !== key) return '';
    return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
  };

  /* ── col filter helper ── */
  const setColFilter = (col, val) => setColFilters(prev => ({ ...prev, [col]: val }));

  /* ── ask GPT (filtered records only) ── */
  const askGptForRecord = async (record) => {
    const requestId = record.request_id;
    setAskGptLoading(prev => ({ ...prev, [requestId]: true }));
    const predictedStatus = String(record.pred_subtype_2 || '').trim().toLowerCase();

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
          predicted_status: predictedStatus,
          pred_type: record.pred_type || '',
          pred_subtype: record.pred_subtype || '',
          stage2_subtype: record.pred_subtype_2 || '',
          candidate_subtype: record.pred_subtype_1 || record.pred_subtype || '',
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
        text: '',
        subtype: null,
        decision: null,
        mappedAllowedSubtype: '',
        suggestedMissingSubtype: '',
        reason: '',
        error: err.message || '(error)',
      };
    }

    setGptResults(prev => ({ ...prev, [requestId]: result }));
    const legacyVerdict = toLegacyYesNo(result.decision || result.subtype, predictedStatus);
    const structuredReasoning = JSON.stringify({
      decision: result.decision || result.subtype || '',
      mapped_allowed_subtype: result.mappedAllowedSubtype || '',
      suggested_missing_subtype: result.suggestedMissingSubtype || '',
      reasoning: result.text || result.reason || (result.error ? `Error: ${result.error}` : ''),
    });
    fetch('/api/gpt-results', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id: runId,
        results: {
          [requestId]: {
            verdict: legacyVerdict,
            reasoning: structuredReasoning,
          },
        },
      }),
    })
      .then(() => {
        if (onGptResultsUpdated) onGptResultsUpdated();
      })
      .catch(() => {});

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

  const handleBulkAcceptGpt = (recordsToProcess) => {
    const allowedSet = new Set((countrySubtypes || []).map(o => o.subtype).filter(Boolean));
    const bulkVerdicts = {};
    recordsToProcess.forEach(r => {
      const gpt = gptResults[r.request_id];
      if (!gpt) return;
      const gptMapped = String(gpt.mappedAllowedSubtype || '').trim();
      let suggested = '';
      if (gpt.decision === 'truly_unknown' || gptMapped.toLowerCase() === 'unknown') {
        suggested = 'unknown';
      } else if (gptMapped && allowedSet.has(gptMapped)) {
        suggested = gptMapped;
      } else if (String(gpt.suggestedMissingSubtype || '').trim()) {
        suggested = 'Missing';
      }
      if (suggested) bulkVerdicts[r.request_id] = suggested;
    });
    if (Object.keys(bulkVerdicts).length > 0) onBulkVerdict(bulkVerdicts);
  };

  /* ── json rendering ── */
  const copyCellJson = (obj, label, cellKey) => {
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2)).then(() => {
      setToast(`${label} copied!`);
      setCopiedCell(cellKey);
      setTimeout(() => setCopiedCell(null), 1000);
    }).catch(() => setToast(`Failed to copy ${label}`));
  };

  const renderPrettyJson = (raw, cellKey, label) => {
    let obj = raw;
    if (typeof raw === 'string') {
      try { obj = JSON.parse(raw); } catch { /* leave as string */ }
    }
    const isEmpty = !obj || (typeof obj === 'object' ? Object.keys(obj).length === 0 : String(obj).trim() === '');
    if (isEmpty) return <div className="json-empty">(empty)</div>;
    const display = typeof obj === 'object' ? JSON.stringify(obj, null, 2) : String(obj);
    return (
      <div className="json-cell-wrapper">
        <button className="copy-json-btn" onClick={e => { e.stopPropagation(); copyCellJson(obj, label, cellKey); }}>
          {copiedCell === cellKey ? 'Copied ✔' : 'Copy'}
        </button>
        <pre className="json-pretty">{display}</pre>
      </div>
    );
  };

  /* ── export ── */
  const doExport = (kind) => {
    const headers = isRetag
      ? ['request_id', 'pred_subtype_1', 'fewshots', 'gpt_verdict', 'gpt_reason', 'true_subtype', 'attributes', 'metadata']
      : ['request_id', 'pred_type', 'pred_subtype', 'verdict', 'ask_gpt', 'attributes', 'metadata'];
    const rows = filtered.map(r => {
      const verdict = verdicts[r.request_id] || '';
      const gpt = gptResults[r.request_id];
      const stage1 = r.pred_subtype_1 || r.pred_subtype || '';
      return isRetag
        ? [r.request_id, stage1, (r.feshots || r.fewshots || []).join(', '), gpt?.decision || '', gpt?.reason || gpt?.text || '', verdicts[r.request_id] || '', JSON.stringify(r.attributes ?? ''), JSON.stringify(r.metadata ?? '')]
        : [r.request_id, r.pred_type, r.pred_subtype, verdict, getAskText(gpt), JSON.stringify(r.attributes ?? ''), JSON.stringify(r.metadata ?? '')];
    });

    if (kind === 'csv') {
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
      a.download = `validation_${runName || runId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Validation');
      XLSX.writeFile(wb, `validation_${runName || runId}.xlsx`);
    }
  };

  return (
    <div className={`validation-panel row-level-table-panel row-height-${rowHeight}`} ref={panelRef}>
      {toast && <div className="copy-toast">{toast}</div>}

      <div className="validation-toolbar" ref={toolbarRef}>
        {/* Progress stats */}
        <div className="validation-stats">
          {!isRetag && (
            <>
              <span className="validation-progress">{reviewed}/{total} reviewed</span>
              <span className="validation-stat verdict-justified-bg">{justifiedCount} justified</span>
              <span className="validation-stat verdict-unjustified-bg">{unjustifiedCount} not justified</span>
              <span className="validation-stat verdict-unclear-bg">{unclearCount} unclear</span>
            </>
          )}
        </div>

        {hasGridFilter && (
          <div className="validation-grid-filter">
            <span className="validation-grid-filter-badge" title={gridFilterLabel}>
              Active grid filter: {gridFilterLabel}
            </span>
            <button
              className="validation-grid-filter-clear"
              onClick={onClearGridFilter}
              title="Clear Type Health filter"
            >
              Clear
            </button>
          </div>
        )}

        {/* Filter */}
        {isRetag ? (
          <>
            <div className="validation-verdict-tabs">
              {[
                { key: 'all',           label: 'All',           count: total,                       title: 'All records in this run' },
                { key: 'unreviewed',    label: 'Unreviewed',    count: total - anyReviewedCount,     title: 'No GPT verdict and no human tag yet' },
                { key: 'real_unknown',  label: 'Real Unknown',  count: realUnknownCount,             title: 'GPT judged truly unknown — no actionable content signal' },
                { key: 'false_unknown', label: 'False Unknown', count: falseUnknownCount,            title: 'GPT judged wrong subtype or mappable to an existing one' },
              ].map(t => (
                <button
                  key={t.key}
                  title={t.title}
                  className={`validation-verdict-tab${verdictFilter === t.key ? ' active' : ''}`}
                  onClick={() => setVerdictFilter(t.key)}
                >
                  {t.label} <span className="validation-verdict-tab-count">{t.count}</span>
                </button>
              ))}
            </div>
            <div className="validation-retag-stats">
              <span className="validation-progress">{anyReviewedCount}/{total} reviewed</span>
              <span className="validation-progress">{retaggedCount}/{total} retagged</span>
            </div>
          </>
        ) : (
          <div className="validation-filters">
            <select
              className="validation-verdict-filter"
              value={verdictFilter}
              onChange={e => setVerdictFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="unreviewed">Unreviewed</option>
              <option value="justified">Justified</option>
              <option value="unjustified">Not Justified</option>
              <option value="unclear">Unclear</option>
            </select>
          </div>
        )}

        {/* Bulk actions — only for verdict mode */}
        {!isRetag && selectedIds.size > 0 && (
          <div className="validation-bulk">
            <span className="validation-bulk-count">{selectedIds.size} selected</span>
            {VERDICTS.map(v => (
              <button key={v.value} className={`validation-bulk-btn ${v.className}`} onClick={() => handleBulkVerdict(v.value)}>
                {v.label}
              </button>
            ))}
            <button className="validation-bulk-btn validation-bulk-clear" onClick={() => setSelectedIds(new Set())}>Clear</button>
          </div>
        )}

        {/* Row height, export, ask gpt */}
        <div className="validation-controls">
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
            className="export-csv-btn ask-gpt-btn"
            onClick={() => handleBulkAcceptGpt(filtered)}
            disabled={gptRunning || !filtered.some(r => gptResults[r.request_id])}
            title="Accept GPT suggestions for all reviewed records"
          >
            Accept GPT
          </button>
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
      </div>

      {/* Table */}
      <div className="validation-table-wrap">
        <table className="validation-table records-table">
          <thead>
            {/* Column headers */}
            {isRetag ? (
              <tr>
                <th style={{ width: 120, cursor: 'pointer' }} onClick={() => handleSort('request_id')}>
                  Request ID{sortIndicator('request_id')}
                </th>
                <th style={{ width: 250 }}>
                  <div className="header-cell">
                    Attributes
                    <div className="attr-lang-toggle" onClick={e => e.stopPropagation()}>
                      <button className={`attr-lang-btn${attrLang === 'original' ? ' active' : ''}`} onClick={() => setAttrLang('original')}>orig</button>
                      <button className={`attr-lang-btn${attrLang === 'en' ? ' active' : ''}`} onClick={() => setAttrLang('en')}>EN</button>
                    </div>
                  </div>
                </th>
                <th style={{ width: 250 }}>
                  <div className="header-cell">
                    Metadata
                    <div className="attr-lang-toggle" onClick={e => e.stopPropagation()}>
                      <button className={`attr-lang-btn${metaLang === 'original' ? ' active' : ''}`} onClick={() => setMetaLang('original')}>orig</button>
                      <button className={`attr-lang-btn${metaLang === 'en' ? ' active' : ''}`} onClick={() => setMetaLang('en')}>EN</button>
                    </div>
                  </div>
                </th>
                <th style={{ width: 240, cursor: 'pointer' }} onClick={() => handleSort('feshots')}>
                  Fewshots{sortIndicator('feshots')}
                </th>
                <th style={{ width: 240, cursor: 'pointer' }} onClick={() => handleSort('gpt_verdict')}>
                  GPT Verdict{sortIndicator('gpt_verdict')}
                </th>
                <th style={{ width: 160, cursor: 'pointer' }} onClick={() => handleSort('gpt_subtype')}>
                  GPT Subtype{sortIndicator('gpt_subtype')}
                </th>
                <th style={{ width: 160, cursor: 'pointer' }} onClick={() => handleSort('verdict')}>
                  True Subtype{sortIndicator('verdict')}
                </th>
              </tr>
            ) : (
              <tr>
                <th style={{ width: 40 }}>
                  <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} />
                </th>
                <th style={{ width: 120, cursor: 'pointer' }} onClick={() => handleSort('request_id')}>
                  Request ID{sortIndicator('request_id')}
                </th>
                <th style={{ width: 170, cursor: 'pointer' }} onClick={() => handleSort('pred_subtype_1')}>
                  Pred Subtype 1{sortIndicator('pred_subtype_1')}
                </th>
                <th style={{ width: 250 }}>
                  <div className="header-cell">
                    Attributes
                    <div className="attr-lang-toggle" onClick={e => e.stopPropagation()}>
                      <button className={`attr-lang-btn${attrLang === 'original' ? ' active' : ''}`} onClick={() => setAttrLang('original')}>orig</button>
                      <button className={`attr-lang-btn${attrLang === 'en' ? ' active' : ''}`} onClick={() => setAttrLang('en')}>EN</button>
                    </div>
                  </div>
                </th>
                <th style={{ width: 250 }}>
                  <div className="header-cell">
                    Metadata
                    <div className="attr-lang-toggle" onClick={e => e.stopPropagation()}>
                      <button className={`attr-lang-btn${metaLang === 'original' ? ' active' : ''}`} onClick={() => setMetaLang('original')}>orig</button>
                      <button className={`attr-lang-btn${metaLang === 'en' ? ' active' : ''}`} onClick={() => setMetaLang('en')}>EN</button>
                    </div>
                  </div>
                </th>
                <th style={{ width: 160, cursor: 'pointer' }} onClick={() => handleSort('verdict')}>
                  Verdict{sortIndicator('verdict')}
                </th>
                <th style={{ width: 320, cursor: 'pointer' }} onClick={() => handleSort('ask_gpt')}>
                  Ask GPT{sortIndicator('ask_gpt')}
                </th>
              </tr>
            )}
            {/* Column filters */}
            {isRetag ? (
              <tr className="col-filter-row">
                <th><input className="col-filter-input" placeholder="filter…" value={colFilters.request_id} onChange={e => setColFilter('request_id', e.target.value)} /></th>
                <th><input className="col-filter-input" placeholder="filter…" value={colFilters.attributes} onChange={e => setColFilter('attributes', e.target.value)} /></th>
                <th><input className="col-filter-input" placeholder="filter…" value={colFilters.metadata} onChange={e => setColFilter('metadata', e.target.value)} /></th>
                <th />
                <th />
                <th />
                <th />
              </tr>
            ) : (
              <tr className="col-filter-row">
                <th />
                <th><input className="col-filter-input" placeholder="filter…" value={colFilters.request_id} onChange={e => setColFilter('request_id', e.target.value)} /></th>
                <th><input className="col-filter-input" placeholder="filter…" value={colFilters.pred_subtype} onChange={e => setColFilter('pred_subtype', e.target.value)} /></th>
                <th><input className="col-filter-input" placeholder="filter…" value={colFilters.attributes} onChange={e => setColFilter('attributes', e.target.value)} /></th>
                <th><input className="col-filter-input" placeholder="filter…" value={colFilters.metadata} onChange={e => setColFilter('metadata', e.target.value)} /></th>
                <th />
                <th />
              </tr>
            )}
          </thead>
          <tbody>
            {pageData.map(r => {
              const verdict = verdicts[r.request_id] || '';
              const gpt = gptResults[r.request_id];
              const attrData = attrLang === 'en' ? (r.en_attributes || r.attributes) : r.attributes;
              const metaData = metaLang === 'en' ? (r.en_metadata || r.metadata) : r.metadata;
              const stage1 = r.pred_subtype_1 || r.pred_subtype || '';
              const fewshotsText = (r.feshots || r.fewshots || []).join(', ');

              if (isRetag) {
                return (
                  <tr key={r.request_id}>
                    <td className="cell-request-id">{r.request_id}</td>
                    <td className="cell-json">{renderPrettyJson(attrData, `attr-${r.request_id}`, 'Attributes')}</td>
                    <td className="cell-json">{renderPrettyJson(metaData, `meta-${r.request_id}`, 'Metadata')}</td>
                    <td className="cell-fewshots">{fewshotsText}</td>
                    <td className="cell-gpt-verdict">
                      <GptVerdictBadge gpt={gpt} />
                      <button
                        className="ask-gpt-row-btn"
                        disabled={Boolean(askGptLoading[r.request_id])}
                        onClick={e => { e.stopPropagation(); askGptForRecord(r); }}
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
                    <td className="cell-verdict cell-retag">
                      <TrueSubtypeBadge verdict={verdict} />
                      <ValidationRecordDecisionControls
                        requestId={r.request_id}
                        verdict={verdict}
                        gpt={gpt}
                        countrySubtypes={countrySubtypes}
                        onSetVerdict={onSetVerdict}
                      />
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={r.request_id} className={verdict ? `validation-row-${verdict}` : ''}>
                  <td>
                    <input type="checkbox" checked={selectedIds.has(r.request_id)} onChange={() => toggleSelect(r.request_id)} />
                  </td>
                  <td className="cell-request-id">{r.request_id}</td>
                  <td><strong>{stage1}</strong></td>
                  <td className="cell-json">{renderPrettyJson(attrData, `attr-${r.request_id}`, 'Attributes')}</td>
                  <td className="cell-json">{renderPrettyJson(metaData, `meta-${r.request_id}`, 'Metadata')}</td>
                  <td className="cell-verdict">
                    <div className="verdict-buttons">
                      {VERDICTS.map(v => (
                        <button
                          key={v.value}
                          className={`verdict-btn ${v.className}${verdict === v.value ? ' active' : ''}`}
                          onClick={() => onSetVerdict(r.request_id, verdict === v.value ? '' : v.value)}
                          title={v.label}
                        >
                          {v.value === 'justified' ? '✓' : v.value === 'unjustified' ? '✗' : '?'}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="ask-gpt-td">
                    <div className="ask-gpt-cell">
                      <div className="ask-gpt-placeholder">{getAskText(gpt)}</div>
                      <button
                        className="ask-gpt-row-btn"
                        disabled={Boolean(askGptLoading[r.request_id])}
                        onClick={e => { e.stopPropagation(); askGptForRecord(r); }}
                      >
                        {askGptLoading[r.request_id] ? 'Asking…' : 'Ask GPT'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="pagination">
        <div className="page-size-control">
          <span className="page-size-label">Per page:</span>
          {PAGE_SIZE_OPTIONS.map(opt => (
            <button key={opt} className={`page-size-btn${pageSize === opt ? ' active' : ''}`} onClick={() => { setPageSize(opt); setCurrentPage(0); }}>{opt}</button>
          ))}
        </div>
        {totalPages > 1 && (
          <div className="page-nav">
            <button disabled={currentPage === 0} onClick={() => setCurrentPage(0)}>«</button>
            <button disabled={currentPage === 0} onClick={() => setCurrentPage(p => p - 1)}>‹</button>
            <span className="page-info">Page {currentPage + 1} of {totalPages}</span>
            <button disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage(p => p + 1)}>›</button>
            <button disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage(totalPages - 1)}>»</button>
          </div>
        )}
        <span className="page-total">{filtered.length} records</span>
      </div>
    </div>
  );
}

export default ValidationPanel;
