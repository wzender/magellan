import React, { useState, useEffect, useRef, useMemo, useDeferredValue } from 'react';
import * as XLSX from 'xlsx';
import { PS2_UNKNOWN, PS2_MISSING } from '../config';

/* ── Per-record decision controls (Tag Subtype) ────────────────────────── */
function ValidationRecordDecisionControls({ requestId, verdict, countrySubtypes, onSetVerdict }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mapQuery, setMapQuery]       = useState('');
  const searchInputRef = useRef(null);
  const dropdownRef = useRef(null);

  const allowedSet     = new Set((countrySubtypes || []).map(o => o.subtype).filter(Boolean));
  const subtypeOptions = [...allowedSet];
  const dropdownOptions = ['unknown', 'Missing', ...subtypeOptions];
  const filteredOptions = mapQuery
    ? dropdownOptions.filter(s => s.toLowerCase().includes(mapQuery.toLowerCase()))
    : dropdownOptions;

  useEffect(() => {
    if (menuOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setMenuOpen(false);
        setMapQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const commit = (val) => onSetVerdict(requestId, val || '');
  const handleOptionPick = (value) => {
    commit(verdict === value ? '' : value);
    setMenuOpen(false);
    setMapQuery('');
  };

  const selectedLegendClass = !verdict
    ? ''
    : verdict === 'unknown'
      ? 'is-truly-unknown'
      : verdict === 'Missing'
        ? 'is-suggested'
        : 'is-mapped';

  return (
    <div className="validation-tag-subtype-wrap" ref={dropdownRef}>
      <button
        type="button"
        className={`validation-tag-trigger${menuOpen ? ' open' : ''}${selectedLegendClass ? ` ${selectedLegendClass}` : ''}`}
        onClick={() => setMenuOpen(v => !v)}
        title="Tag correct subtype"
      >
        <span className="validation-tag-trigger-text">
          {verdict ? (verdict === 'unknown' ? 'Unknown' : verdict) : 'Select subtype'}
        </span>
        <span className="validation-tag-trigger-caret">{menuOpen ? '▲' : '▼'}</span>
      </button>
      <div className={`validation-tag-dropdown${menuOpen ? ' open' : ''}`}>
        <input
          ref={searchInputRef}
          className="validation-tag-search"
          placeholder="Search or select..."
          value={mapQuery}
          onChange={e => setMapQuery(e.target.value)}
          autoComplete="off"
        />
        <ul className="validation-tag-list">
          <li
            className={`validation-tag-option validation-tag-clear-option${!verdict ? ' disabled' : ''}`}
            onMouseDown={e => {
              e.preventDefault();
              if (!verdict) return;
              commit('');
              setMenuOpen(false);
              setMapQuery('');
            }}
            title={!verdict ? 'Already untagged' : 'Clear selection and return to untagged'}
          >
            Clear selection (Untagged)
          </li>
          {filteredOptions.length > 0 ? (
            filteredOptions.map(s => (
              <li
                key={s}
                className={`validation-tag-option${verdict === s ? ' selected' : ''}`}
                onMouseDown={e => { e.preventDefault(); handleOptionPick(s); }}
              >
                <span className="validation-tag-option-text">{s === 'unknown' ? 'Unknown' : s}</span>
                {verdict === s && <span className="validation-tag-checkmark">✓</span>}
              </li>
            ))
          ) : (
            <li className="validation-tag-option validation-tag-empty">No matches</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function ValueCountFilterDropdown({ values, options, onChange, allLabel = 'All values', emptyLabel = '(empty)', compact = false, title = 'Filter values' }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchInputRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (menuOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setMenuOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter(option => option.label.toLowerCase().includes(normalizedQuery))
    : options;

  const selectedValues = Array.isArray(values) ? values : [];
  const selectedCount = selectedValues.length;
  const selectedLabel = selectedCount === 0
    ? allLabel
    : selectedCount === 1
      ? options.find(option => option.value === selectedValues[0])?.label || (selectedValues[0] === '__EMPTY__' ? emptyLabel : selectedValues[0])
      : `${selectedCount} selected`;

  return (
    <div className="validation-tag-subtype-wrap" ref={dropdownRef}>
      <button
        type="button"
        className={`validation-tag-trigger${menuOpen ? ' open' : ''}${compact ? ' validation-tag-trigger-compact' : ''}${selectedCount > 0 ? ' is-filter-active' : ''}`}
        onClick={e => {
          e.stopPropagation();
          setMenuOpen(prev => !prev);
        }}
        title={title}
      >
        {compact ? (
          <>
            <span className="validation-filter-icon" aria-hidden="true">
              <svg viewBox="0 0 16 16" width="12" height="12">
                <path d="M2 3h12l-4.8 5.2v3.9l-2.4 1.3V8.2L2 3z" fill="currentColor" />
              </svg>
            </span>
            {selectedCount > 0 && <span className="validation-filter-badge">{selectedCount}</span>}
          </>
        ) : (
          <>
            <span className="validation-tag-trigger-text">{selectedLabel}</span>
            <span className="validation-tag-trigger-caret">{menuOpen ? '▲' : '▼'}</span>
          </>
        )}
      </button>
      <div className={`validation-tag-dropdown${menuOpen ? ' open' : ''}${compact ? ' validation-tag-dropdown-compact' : ''}`} onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
        <input
          ref={searchInputRef}
          className="validation-tag-search"
          placeholder="Filter values..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoComplete="off"
        />
        <ul className="validation-tag-list">
          <li
            className={`validation-tag-option${selectedCount === 0 ? ' selected' : ''}`}
            onMouseDown={e => {
              e.preventDefault();
              onChange([]);
            }}
          >
            <span className="validation-tag-option-text">{allLabel}</span>
            <span className="validation-tag-checkmark">{selectedCount === 0 ? '✓' : ''}</span>
          </li>
          {filteredOptions.length > 0 ? filteredOptions.map(option => (
            <li
              key={option.value}
              className={`validation-tag-option${selectedValues.includes(option.value) ? ' selected' : ''}`}
              onMouseDown={e => {
                e.preventDefault();
                const next = selectedValues.includes(option.value)
                  ? selectedValues.filter(v => v !== option.value)
                  : [...selectedValues, option.value];
                onChange(next);
              }}
              title={`${option.label} (${option.count})`}
            >
              <span className="validation-tag-option-text">{option.label}</span>
              <span className="validation-tag-checkmark">{selectedValues.includes(option.value) ? `✓ ${option.count}` : option.count}</span>
            </li>
          )) : (
            <li className="validation-tag-option validation-tag-empty">No matches</li>
          )}
        </ul>
      </div>
    </div>
  );
}

const EMPTY_COL_FILTERS = { request_id: '', pred_subtype: '', attributes: '', metadata: '', gpt_subtype: [], true_subtype: [] };

const GPT_VERDICT_CONFIG = {
  unknown:  { label: 'Unknown',          cls: 'gpt-verdict-truly-unknown' },
  existing: { label: 'Existing Subtype', cls: 'gpt-verdict-wrong-subtype' },
  missing:  { label: 'Missing Subtype',  cls: 'gpt-verdict-true-missing' },
  error:    { label: 'Error',            cls: 'gpt-verdict-error' },
};

function GptVerdictBadge({ gpt }) {
  if (!gpt) return <span className="gpt-verdict-badge gpt-verdict-unreviewed">Unreviewed</span>;
  if (gpt.error) {
    const friendly = explainGptError(gpt.error);
    return <span className="gpt-verdict-badge gpt-verdict-error" title={`${friendly}${gpt.error ? ` | raw: ${gpt.error}` : ''}`}>Error</span>;
  }
  const cfg = GPT_VERDICT_CONFIG[getGptResponseKind(gpt)];
  const badge = cfg
    ? <span className={`gpt-verdict-badge ${cfg.cls}`}>{cfg.label}</span>
    : <span className="gpt-verdict-badge gpt-verdict-unreviewed">{gpt.responseKind || gpt.decision || 'Unreviewed'}</span>;
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

function explainGptError(rawError) {
  const error = String(rawError || '').trim();
  const lower = error.toLowerCase();
  if (!error) return 'GPT returned an error';
  if (lower.includes('error_parse')) {
    return 'GPT response could not be validated (invalid JSON or missing required fields)';
  }
  if (lower.includes('malformed json')) {
    return 'GPT returned malformed JSON';
  }
  if (lower.includes('unsupported response_kind')) {
    return 'GPT returned an unsupported response_kind';
  }
  if (lower.includes('without concrete suggested_subtype')) {
    return 'GPT marked missing but did not provide a concrete subtype';
  }
  if (lower.includes('without allowed suggested_subtype')) {
    return 'GPT marked existing but did not provide an allowed subtype';
  }
  if (lower.includes('error_fetch')) {
    return 'Network/API request failed while calling GPT';
  }
  return error;
}

function pickFirstNonEmpty(...values) {
  LOG.debug(`[pickFirstNonEmpty]: entering with ${values.length} candidates: [${values.map(v => JSON.stringify(v)).join(', ')}]`);
  for (let i = 0; i < values.length; i++) {
    const text = String(values[i] || '').trim();
    if (text) {
      LOG.debug(`[pickFirstNonEmpty]: exiting with "${text}" (from candidate index ${i})`);
      return text;
    }
    LOG.debug(`[pickFirstNonEmpty]: candidate[${i}] is empty (raw=${JSON.stringify(values[i])})`);
  }
  LOG.debug(`[pickFirstNonEmpty]: exiting with "" (all candidates empty)`);
  return '';
}

function normalizeGptResult(value) {
  LOG.debug(`[normalizeGptResult]: entering with value keys=${value ? Object.keys(value).join(',') : 'null'}`);
  if (!value) {
    LOG.debug(`[normalizeGptResult]: exiting with null — reason: value is null/undefined`);
    return null;
  }

  let parsedReasoning = null;
  if (typeof value.reasoning === 'string' && value.reasoning.trim().startsWith('{')) {
    try {
      parsedReasoning = JSON.parse(value.reasoning);
      LOG.debug(`[normalizeGptResult]: parsed reasoning JSON successfully, keys=${Object.keys(parsedReasoning).join(',')}`);
    } catch {
      parsedReasoning = null;
      LOG.debug(`[normalizeGptResult]: failed to parse reasoning as JSON`);
    }
  } else {
    LOG.debug(`[normalizeGptResult]: reasoning is not a JSON string (type=${typeof value.reasoning}, startsWith={=${typeof value.reasoning === 'string' ? value.reasoning.trim().charAt(0) : 'N/A'})`);
  }

  const decision = value.decision || value.subtype || parsedReasoning?.decision || value.verdict || null;
  const responseKind = normalizeResponseKind(
    value.response_kind || parsedReasoning?.response_kind || (value.error || parsedReasoning?.error ? 'error' : decision)
  );
  LOG.debug(`[normalizeGptResult]: decision resolved to "${decision}" from: value.decision=${JSON.stringify(value.decision)}, value.subtype=${JSON.stringify(value.subtype)}, parsedReasoning?.decision=${JSON.stringify(parsedReasoning?.decision)}, value.verdict=${JSON.stringify(value.verdict)} | responseKind="${responseKind}"`);

  LOG.debug(`[normalizeGptResult]: resolving gptSubtype...`);
  const gptSubtype = pickFirstNonEmpty(value.gpt_subtype, parsedReasoning?.gpt_subtype);
  LOG.debug(`[normalizeGptResult]: resolving mappedAllowedSubtype...`);
  const mappedAllowedSubtype = pickFirstNonEmpty(value.mapped_allowed_subtype, parsedReasoning?.mapped_allowed_subtype);
  LOG.debug(`[normalizeGptResult]: resolving suggestedMissingSubtype...`);
  const suggestedMissingSubtype = pickFirstNonEmpty(
    value.suggested_missing_subtype,
    parsedReasoning?.suggested_missing_subtype,
    value.suggested_subtype,
    parsedReasoning?.suggested_subtype,
    value.suggetsed_missing_subtype,
    parsedReasoning?.suggetsed_missing_subtype,
    value.sugested_missing_subtype,
    parsedReasoning?.sugested_missing_subtype,
  );
  const suggestedSubtype = pickFirstNonEmpty(
    value.suggested_subtype,
    parsedReasoning?.suggested_subtype,
    gptSubtype,
    suggestedMissingSubtype,
  );

  const result = {
    text: value.text || '',
    rawResponse: value.raw_response || parsedReasoning?.raw_response || '',
    subtype: decision,
    decision,
    responseKind,
    suggestedSubtype,
    gptSubtype,
    mappedAllowedSubtype,
    suggestedMissingSubtype,
    reason: value.reason || parsedReasoning?.reasoning || value.reasoning || '',
    error: value.error || parsedReasoning?.error || (suggestedSubtype.startsWith('ERROR_') ? suggestedSubtype : null),
  };
  LOG.debug(`[normalizeGptResult]: exiting with {decision="${decision}", responseKind="${responseKind}", suggestedSubtype="${suggestedSubtype}", gptSubtype="${gptSubtype}", mappedAllowedSubtype="${mappedAllowedSubtype}", suggestedMissingSubtype="${suggestedMissingSubtype}", error=${JSON.stringify(result.error)}}`);
  return result;
}

function toLegacyYesNo(decision, predictedStatus) {
  const d = String(decision || '').trim();
  const status = String(predictedStatus || '').trim().toLowerCase();

  if (!d) return '';

  if (d === 'yes' || d === 'no') return d;
  if (d === 'error') return '';
  if (d === 'unknown') return 'no';
  if (d === 'existing') return 'yes';
  if (d === 'missing') return status === 'missing' ? 'yes' : 'no';

  if (status === 'unknown') {
    return d === 'truly_unknown' ? 'no' : 'yes';
  }
  if (status === 'missing') {
    return d === 'true_missing_subtype' ? 'yes' : 'no';
  }

  return 'no';
}

function normalizeDecision(value) {
  const result = String(value || '').trim().toLowerCase();
  LOG.debug(`[normalizeDecision]: entering with value=${JSON.stringify(value)} | exiting with "${result}"`);
  return result;
}

function normalizeResponseKind(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'existing' || raw === 'missing' || raw === 'unknown' || raw === 'error') return raw;
  if (raw === 'truly_unknown') return 'unknown';
  if (raw === 'true_missing_subtype') return 'missing';
  if (raw === 'missing_but_mappable' || raw === 'wrong_subtype') return 'existing';
  if (raw.startsWith('error_')) return 'error';
  return '';
}

function getGptResponseKind(result) {
  if (!result) return '';
  const normalized = normalizeResponseKind(
    result.responseKind || result.response_kind || result.decision || result.subtype || (result.error ? 'error' : '')
  );
  if (normalized) return normalized;
  const suggestedSubtype = String(result.suggestedSubtype || '').trim();
  if (suggestedSubtype.toLowerCase() === 'unknown') return 'unknown';
  if (suggestedSubtype.startsWith('ERROR_')) return 'error';
  return '';
}

function getGptSubtypeState(result) {
  LOG.debug(`[getGptSubtypeState]: entering with result=${JSON.stringify({
    error: result?.error || null,
    gptSubtype: result?.gptSubtype || '',
    responseKind: result?.responseKind || result?.response_kind || '',
    suggestedSubtype: result?.suggestedSubtype || '',
    decision: result?.decision || '',
    subtype: result?.subtype || '',
    mappedAllowedSubtype: result?.mappedAllowedSubtype || '',
    suggestedMissingSubtype: result?.suggestedMissingSubtype || '',
  })}`);

  if (!result) {
    const out = { text: '', source: 'none', condition: 'no-result' };
    LOG.debug(`[getGptSubtypeState]: exiting with ${JSON.stringify(out)} — reason: result is null/undefined`);
    return out;
  }

  const persistedSubtype = String(result.gptSubtype || '').trim();
  const isPersistedEnumPlaceholder = persistedSubtype.startsWith('ENUM_');
  LOG.debug(`[getGptSubtypeState]: persistedSubtype="${persistedSubtype}" isPersistedEnumPlaceholder=${isPersistedEnumPlaceholder}`);
  if (persistedSubtype && !isPersistedEnumPlaceholder) {
    const out = { text: persistedSubtype, source: 'persisted', condition: 'persisted-gpt-subtype' };
    LOG.debug(`[getGptSubtypeState]: exiting with ${JSON.stringify(out)} — reason: non-enum persisted subtype found`);
    return out;
  }

  const responseKind = getGptResponseKind(result);
  const suggestedSubtype = String(result.suggestedSubtype || '').trim();
  LOG.debug(`[getGptSubtypeState]: responseKind="${responseKind}" suggestedSubtype="${suggestedSubtype}"`);
  if (suggestedSubtype) {
    const out = {
      text: suggestedSubtype,
      source: responseKind ? `response-kind-${responseKind}` : 'suggested-subtype',
      condition: responseKind ? `response-kind-${responseKind}` : 'suggested-subtype',
    };
    LOG.debug(`[getGptSubtypeState]: exiting with ${JSON.stringify(out)} — reason: suggestedSubtype is always authoritative in the simplified flow`);
    return out;
  }

  if (result.error) {
    const out = { text: 'ENUM_ERROR', source: 'error', condition: 'error' };
    LOG.debug(`[getGptSubtypeState]: exiting with ${JSON.stringify(out)} — reason: result.error="${result.error}" and no suggestedSubtype available`);
    return out;
  }

  // Check mapped/suggested BEFORE decision — a concrete subtype from the allowed
  // list or a GPT suggestion is the strongest signal and should always win,
  // even if the decision is 'truly_unknown'.
  const mapped = String(result.mappedAllowedSubtype || '').trim();
  LOG.debug(`[getGptSubtypeState]: mapped="${mapped}" (raw mappedAllowedSubtype=${JSON.stringify(result.mappedAllowedSubtype)})`);
  if (mapped.toLowerCase() === 'unknown') {
    const out = { text: 'unknown', source: 'truly-unknown', condition: 'mapped-unknown' };
    LOG.debug(`[getGptSubtypeState]: exiting with ${JSON.stringify(out)} — reason: mapped is 'unknown'`);
    return out;
  }
  if (mapped) {
    const out = { text: mapped, source: 'mapped', condition: 'mapped' };
    LOG.debug(`[getGptSubtypeState]: exiting with ${JSON.stringify(out)} — reason: mapped is non-empty`);
    return out;
  }
  LOG.debug(`[getGptSubtypeState]: mapped is empty, checking suggested...`);

  const suggested = String(result.suggestedMissingSubtype || '').trim();
  LOG.debug(`[getGptSubtypeState]: suggested="${suggested}" (raw suggestedMissingSubtype=${JSON.stringify(result.suggestedMissingSubtype)})`);
  if (suggested) {
    const out = { text: suggested, source: 'suggested', condition: 'suggested-missing-subtype' };
    LOG.debug(`[getGptSubtypeState]: exiting with ${JSON.stringify(out)} — reason: suggested is non-empty`);
    return out;
  }
  LOG.debug(`[getGptSubtypeState]: suggested is empty, checking decision...`);

  const decision = normalizeDecision(result.decision || result.subtype || result.responseKind);
  LOG.debug(`[getGptSubtypeState]: decision="${decision}" (raw decision=${JSON.stringify(result.decision)}, raw subtype=${JSON.stringify(result.subtype)})`);
  if (decision === 'truly_unknown') {
    const out = { text: 'unknown', source: 'truly-unknown', condition: 'truly-unknown' };
    LOG.debug(`[getGptSubtypeState]: exiting with ${JSON.stringify(out)} — reason: decision is truly_unknown and no mapped/suggested`);
    return out;
  }

  if (persistedSubtype && isPersistedEnumPlaceholder) {
    const out = { text: persistedSubtype, source: 'persisted-enum', condition: 'persisted-enum-placeholder' };
    LOG.debug(`[getGptSubtypeState]: exiting with ${JSON.stringify(out)} — reason: persisted ENUM placeholder, no better signal found`);
    return out;
  }

  if (!decision) {
    const out = { text: 'ENUM_NO_DECISION', source: 'enum-no-decision', condition: 'no-decision' };
    LOG.debug(`[getGptSubtypeState]: exiting with ${JSON.stringify(out)} — reason: decision is empty`);
    return out;
  }
  if (decision === 'missing_but_mappable') {
    const out = { text: 'ENUM_MAPPABLE_WITHOUT_ALLOWED', source: 'enum-mappable-empty', condition: 'missing-but-mappable-without-allowed-subtype' };
    LOG.debug(`[getGptSubtypeState]: exiting with ${JSON.stringify(out)} — reason: decision=missing_but_mappable but mapped is empty`);
    return out;
  }
  if (decision === 'true_missing_subtype') {
    const out = { text: 'ENUM_MISSING_WITHOUT_SUGGESTION', source: 'enum-missing-empty', condition: 'true-missing-subtype-without-suggestion' };
    LOG.debug(`[getGptSubtypeState]: exiting with ${JSON.stringify(out)} — reason: decision=true_missing_subtype but suggested is empty`);
    return out;
  }
  if (decision === 'wrong_subtype') {
    const out = { text: 'ENUM_WRONG_WITHOUT_TARGET', source: 'enum-wrong-empty', condition: 'wrong-subtype-without-target' };
    LOG.debug(`[getGptSubtypeState]: exiting with ${JSON.stringify(out)} — reason: decision=wrong_subtype but no mapped target`);
    return out;
  }

  const out = { text: `ENUM_EMPTY_${decision.toUpperCase()}`, source: 'enum-empty-generic', condition: `empty-for-decision-${decision}` };
  LOG.debug(`[getGptSubtypeState]: exiting with ${JSON.stringify(out)} — reason: unhandled decision "${decision}"`);
  return out;
}

function getGptSubtype(result) {
  return getGptSubtypeState(result).text;
}

function getGptSubtypeSource(result) {
  return getGptSubtypeState(result).source;
}

function getGptSubtypeLegendClass(result) {
  const responseKind = getGptResponseKind(result);
  if (responseKind === 'unknown') return 'truly-unknown';
  if (responseKind === 'missing') return 'suggested';
  if (responseKind === 'existing') return 'mapped';

  const fallbackSource = getGptSubtypeSource(result);
  if (fallbackSource === 'truly-unknown') return 'truly-unknown';
  if (fallbackSource === 'suggested') return 'suggested';
  if (fallbackSource === 'mapped') return 'mapped';
  return 'empty';
}

function getGptSuggestedVerdict(result, countrySubtypes) {
  if (!result) return '';
  if (getGptResponseKind(result) === 'error') return '';
  const suggestedSubtype = getGptSubtype(result);
  const allowedSet = new Set((countrySubtypes || []).map(o => o.subtype).filter(Boolean));
  const responseKind = getGptResponseKind(result);

  if (responseKind === 'unknown' || suggestedSubtype.toLowerCase() === 'unknown') {
    return 'unknown';
  }
  if (responseKind === 'existing' && suggestedSubtype && allowedSet.has(suggestedSubtype)) {
    return suggestedSubtype;
  }
  if (responseKind === 'missing') {
    return 'Missing';
  }
  return '';
}

function clipLogText(value, max = 900) {
  const text = String(value || '');
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...(truncated ${text.length - max} chars)`;
}

function summarizePayloadShape(value) {
  if (value === null || value === undefined) return { type: 'nullish' };
  if (typeof value === 'string') return { type: 'string', length: value.length };
  if (Array.isArray(value)) return { type: 'array', length: value.length };
  if (typeof value === 'object') return { type: 'object', keys: Object.keys(value).length };
  return { type: typeof value };
}

const LOG = {
  info:  (...args) => console.info( '[INFO][ask-gpt-ui]', ...args),
  warn:  (...args) => console.warn( '[WARN][ask-gpt-ui]', ...args),
  error: (...args) => console.error('[ERROR][ask-gpt-ui]', ...args),
  debug: (...args) => console.debug('[DEBUG][ask-gpt-ui]', ...args),
};

function parseJsonLike(raw) {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

function isUuidLike(text) {
  return /^(?:\{)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}(?:\})?$/i.test(text)
    || /^urn:uuid:[0-9a-f-]{36}$/i.test(text);
}

function isUrlLike(text) {
  return /^(?:https?:\/\/|www\.)\S+$/i.test(text);
}

function isLongNumericId(text) {
  return /^\d{7,}$/.test(text);
}

function isOpaqueMixedId(text) {
  if (text.length < 7) return false;
  if (/\s/.test(text)) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return false;
  return /[A-Za-z]/.test(text) && /\d/.test(text);
}

function isHexLikeId(text) {
  return /^[0-9a-f]{8,}$/i.test(text);
}

function shouldHideJsonStringValue(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (text.toLowerCase() === 'none') return true;
  return isUuidLike(text)
    || isUrlLike(text)
    || isLongNumericId(text)
    || isOpaqueMixedId(text)
    || isHexLikeId(text);
}

function pruneEmptyJsonValue(value) {
  if (value === null || value === undefined) return undefined;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return undefined;
    return shouldHideJsonStringValue(trimmed) ? undefined : value;
  }

  if (Array.isArray(value)) {
    const next = value
      .map(item => pruneEmptyJsonValue(item))
      .filter(item => item !== undefined);
    return next.length > 0 ? next : undefined;
  }

  if (typeof value === 'object') {
    const next = Object.entries(value).reduce((acc, [key, item]) => {
      const pruned = pruneEmptyJsonValue(item);
      if (pruned !== undefined) acc[key] = pruned;
      return acc;
    }, {});
    return Object.keys(next).length > 0 ? next : undefined;
  }

  return value;
}

function getJsonCellState(raw) {
  const fullValue = parseJsonLike(raw);
  const prunedValue = pruneEmptyJsonValue(fullValue);
  const fullDisplay = fullValue === undefined ? '' : JSON.stringify(fullValue, null, 2);
  const prunedDisplay = prunedValue === undefined ? '' : JSON.stringify(prunedValue, null, 2);

  return {
    fullValue,
    prunedValue,
    fullDisplay,
    prunedDisplay,
    isEmpty: prunedValue === undefined,
    hasHiddenValues: fullDisplay !== '' && fullDisplay !== prunedDisplay,
  };
}

function ValidationPanel({ runId, runName, country, countrySubtypes, records, verdicts, gridFilter, onClearGridFilter, onSetVerdict, onBulkVerdict, onGptResultsUpdated, onWarning, publishState = 'idle', onPublishRetagged }) {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [rowHeight, setRowHeight] = useState('3');
  const [colFilters, setColFilters] = useState(EMPTY_COL_FILTERS);
  const deferredColFilters = useDeferredValue(colFilters);
  const [verdictFilter, setVerdictFilter] = useState('all');
  const [attrLang, setAttrLang] = useState('original');
  const [metaLang, setMetaLang] = useState('original');
  const [toast, setToast] = useState(null);
  const [copiedCell, setCopiedCell] = useState(null);
  const [expandedJsonCells, setExpandedJsonCells] = useState({});
  const [gptResults, setGptResults] = useState({});   // request_id -> { verdict, reasoning }
  const [gptRunning, setGptRunning] = useState(false);
  const [gptProgress, setGptProgress] = useState({ done: 0, total: 0 });
  const [clearingEmptyGpt, setClearingEmptyGpt] = useState(false);
  const [clearingRunData, setClearingRunData] = useState(false);
  const [translateState, setTranslateState] = useState({ running: false, field: null, done: 0, total: 0 });
  const [translatedOverrides, setTranslatedOverrides] = useState({});
  const [askGptLoading, setAskGptLoading] = useState({});
  const gptCancelledRef = useRef(false);
  const gptLoadSeqRef = useRef(0);
  const gptRowUpdateSeqRef = useRef({});
  const toolbarRef = useRef(null);
  const panelRef = useRef(null);

  const PAGE_SIZE_OPTIONS = [20, 50, 'All'];
  const ROW_HEIGHT_OPTIONS = ['1', '2', '3', 'Auto'];

  useEffect(() => {
    const tb = toolbarRef.current;
    const panel = panelRef.current;
    if (!tb || !panel) return;

    const updateToolbarHeight = () => {
      panel.style.setProperty('--table-toolbar-h', `${tb.getBoundingClientRect().height}px`);
    };

    updateToolbarHeight();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateToolbarHeight);
      observer.observe(tb);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', updateToolbarHeight);
    return () => window.removeEventListener('resize', updateToolbarHeight);
  }, []);

  useEffect(() => {
    const loadSeq = ++gptLoadSeqRef.current;
    gptRowUpdateSeqRef.current = {};
    setCurrentPage(0);
    setGptResults({});
    setGptRunning(false);
    setAskGptLoading({});
    setExpandedJsonCells({});
    setTranslateState({ running: false, field: null, done: 0, total: 0 });
    setTranslatedOverrides({});
    setColFilters(EMPTY_COL_FILTERS);
    if (runId) {
      LOG.info(`[gpt-results-load][${loadSeq}] START run_id=${runId}`);
      fetch(`/api/gpt-results?run_id=${runId}`)
        .then(r => r.json())
        .then(data => {
          if (!data || typeof data !== 'object') return;
          const mapped = {};
          Object.entries(data).forEach(([requestId, value]) => {
            const rowSeq = gptRowUpdateSeqRef.current[String(requestId)] || 0;
            if (rowSeq > loadSeq) {
              LOG.warn(`[gpt-results-load][${loadSeq}] stale load skipped for request_id=${requestId}; row_update_seq=${rowSeq}`);
              return;
            }
            mapped[requestId] = normalizeGptResult(value);
          });
          LOG.info(`[gpt-results-load][${loadSeq}] DONE run_id=${runId} loaded=${Object.keys(mapped).length}`);
          setGptResults(prev => ({ ...prev, ...mapped }));
        })
        .catch(err => {
          const msg = `[gpt-results-load][${loadSeq}] failed run_id=${runId}: ${err?.message || 'unknown error'}`;
          LOG.error(msg);
          if (onWarning) onWarning(msg);
        });
    }
  }, [runId, onWarning]);

  useEffect(() => {
    setCurrentPage(0);
  }, [
    verdictFilter,
    deferredColFilters.request_id,
    deferredColFilters.pred_subtype,
    deferredColFilters.attributes,
    deferredColFilters.metadata,
    deferredColFilters.gpt_subtype,
    deferredColFilters.true_subtype,
  ]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!records || records.length === 0) {
    return <div className="validation-empty">No records for this run.</div>;
  }

  const subtypeToType = useMemo(
    () => Object.fromEntries((countrySubtypes || []).map(o => [o.subtype, o.type])),
    [countrySubtypes]
  );
  const preparedRecords = useMemo(
    () => records.map(r => ({
      ...r,
      __requestIdLower: String(r.request_id || '').toLowerCase(),
      __stage1Lower: String(r.pred_subtype_1 || r.pred_subtype || '').toLowerCase(),
      __attributesLower: JSON.stringify(r.attributes || '').toLowerCase(),
      __metadataLower: JSON.stringify(r.metadata || '').toLowerCase(),
      __missingSubtypeLower: String(r.missing_subtype || '').trim().toLowerCase(),
    })),
    [records]
  );
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

  const requestIdFilter = deferredColFilters.request_id.toLowerCase();
  const predSubtypeFilter = deferredColFilters.pred_subtype.toLowerCase();
  const attributesFilter = deferredColFilters.attributes.toLowerCase();
  const metadataFilter = deferredColFilters.metadata.toLowerCase();
  const gptSubtypeFilter = Array.isArray(deferredColFilters.gpt_subtype) ? deferredColFilters.gpt_subtype : [];
  const trueSubtypeFilter = Array.isArray(deferredColFilters.true_subtype) ? deferredColFilters.true_subtype : [];

  const gptSubtypeFilterOptions = useMemo(() => {
    let next = preparedRecords;

    if (gridFilter && (gridFilter.trueType !== null || gridFilter.trueSubtype !== null || gridFilter.predSubtype !== null)) {
      next = next.filter(r => {
        const trueSubtype = verdicts[r.request_id] ?? '';
        const trueType = trueSubtype === '' ? NOT_RETAGGED_LABEL : (subtypeToType[trueSubtype] || '');

        if (gridFilter.trueType !== null && gridFilter.trueType !== undefined && trueType !== gridFilter.trueType) return false;
        if (gridFilter.trueSubtype !== null && gridFilter.trueSubtype !== undefined && trueSubtype !== gridFilter.trueSubtype) return false;
        if (gridFilter.predSubtype === '__cross_type__' && r.pred_type === trueType) return false;
        if (gridFilter.predSubtype && gridFilter.predSubtype !== '__cross_type__' && r.pred_subtype !== gridFilter.predSubtype) return false;
        return true;
      });
    }

    if (requestIdFilter) next = next.filter(r => r.__requestIdLower.includes(requestIdFilter));
    if (predSubtypeFilter) next = next.filter(r => r.__stage1Lower.includes(predSubtypeFilter));
    if (attributesFilter) next = next.filter(r => r.__attributesLower.includes(attributesFilter));
    if (metadataFilter) next = next.filter(r => r.__metadataLower.includes(metadataFilter));
    if (trueSubtypeFilter.length > 0) {
      next = next.filter(r => {
        const subtype = String(verdicts[r.request_id] || '').trim();
        return trueSubtypeFilter.some(selected => selected === '__EMPTY__' ? !subtype : subtype === selected);
      });
    }

    if (verdictFilter !== 'all') {
      if (verdictFilter === 'untagged') {
        next = next.filter(r => !verdicts[r.request_id]);
      } else if (verdictFilter === 'only_missing') {
        next = next.filter(r => {
          const v = r.__missingSubtypeLower;
          return v !== '' && v !== 'none' && v !== 'unknown';
        });
      } else if (verdictFilter === 'only_unknown') {
        next = next.filter(r => {
          const v = r.__missingSubtypeLower;
          return v === '' || v === 'none' || v === 'unknown';
        });
      } else if (verdictFilter === 'real_unknown') {
        next = next.filter(r => getGptResponseKind(gptResults[r.request_id]) === 'unknown');
      } else if (verdictFilter === 'real_missing') {
        next = next.filter(r => getGptResponseKind(gptResults[r.request_id]) === 'missing');
      } else if (verdictFilter === 'false_unknown') {
        next = next.filter(r => getGptResponseKind(gptResults[r.request_id]) === 'existing');
      } else if (verdictFilter === 'gpt_error') {
        next = next.filter(r => Boolean(gptResults[r.request_id]?.error));
      } else if (verdictFilter === 'weak_signal') {
        next = next.filter(r =>
          (r.pred_subtype_2 || '') === PS2_MISSING &&
          getGptResponseKind(gptResults[r.request_id]) === 'unknown'
        );
      } else if (verdictFilter === 'false_missing') {
        next = next.filter(r => {
          const isPredMissing = (r.pred_subtype_2 || '') === PS2_MISSING;
          return isPredMissing && getGptResponseKind(gptResults[r.request_id]) === 'existing';
        });
      } else if (verdictFilter === 'truly_unknown') {
        next = next.filter(r => getGptResponseKind(gptResults[r.request_id]) === 'unknown');
      } else if (verdictFilter === 'true_missing_subtype') {
        next = next.filter(r => getGptResponseKind(gptResults[r.request_id]) === 'missing');
      } else if (verdictFilter === 'missing_but_mappable') {
        next = next.filter(r => getGptResponseKind(gptResults[r.request_id]) === 'existing');
      } else if (verdictFilter === 'wrong_subtype') {
        next = next.filter(r => getGptResponseKind(gptResults[r.request_id]) === 'existing');
      } else {
        next = next.filter(r => verdicts[r.request_id] === verdictFilter);
      }
    }

    const counts = next.reduce((acc, record) => {
      const subtype = getGptSubtype(gptResults[record.request_id]);
      const key = subtype ? subtype : '__EMPTY__';
      acc.set(key, (acc.get(key) || 0) + 1);
      return acc;
    }, new Map());

    return Array.from(counts.entries())
      .map(([value, count]) => ({
        value,
        count,
        label: value === '__EMPTY__' ? '(empty)' : value,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  }, [
    preparedRecords,
    gridFilter,
    verdicts,
    subtypeToType,
    requestIdFilter,
    predSubtypeFilter,
    attributesFilter,
    metadataFilter,
    gptSubtypeFilter,
    trueSubtypeFilter,
    verdictFilter,
    gptResults,
  ]);

  const trueSubtypeFilterOptions = useMemo(() => {
    let next = preparedRecords;

    if (gridFilter && (gridFilter.trueType !== null || gridFilter.trueSubtype !== null || gridFilter.predSubtype !== null)) {
      next = next.filter(r => {
        const trueSubtype = verdicts[r.request_id] ?? '';
        const trueType = trueSubtype === '' ? NOT_RETAGGED_LABEL : (subtypeToType[trueSubtype] || '');

        if (gridFilter.trueType !== null && gridFilter.trueType !== undefined && trueType !== gridFilter.trueType) return false;
        if (gridFilter.trueSubtype !== null && gridFilter.trueSubtype !== undefined && trueSubtype !== gridFilter.trueSubtype) return false;
        if (gridFilter.predSubtype === '__cross_type__' && r.pred_type === trueType) return false;
        if (gridFilter.predSubtype && gridFilter.predSubtype !== '__cross_type__' && r.pred_subtype !== gridFilter.predSubtype) return false;
        return true;
      });
    }

    if (requestIdFilter) next = next.filter(r => r.__requestIdLower.includes(requestIdFilter));
    if (predSubtypeFilter) next = next.filter(r => r.__stage1Lower.includes(predSubtypeFilter));
    if (attributesFilter) next = next.filter(r => r.__attributesLower.includes(attributesFilter));
    if (metadataFilter) next = next.filter(r => r.__metadataLower.includes(metadataFilter));
    if (gptSubtypeFilter.length > 0) {
      next = next.filter(r => {
        const subtype = getGptSubtype(gptResults[r.request_id]);
        return gptSubtypeFilter.some(selected => selected === '__EMPTY__' ? !subtype : subtype === selected);
      });
    }

    if (verdictFilter !== 'all') {
      if (verdictFilter === 'untagged') {
        next = next.filter(r => !verdicts[r.request_id]);
      } else if (verdictFilter === 'only_missing') {
        next = next.filter(r => {
          const v = r.__missingSubtypeLower;
          return v !== '' && v !== 'none' && v !== 'unknown';
        });
      } else if (verdictFilter === 'only_unknown') {
        next = next.filter(r => {
          const v = r.__missingSubtypeLower;
          return v === '' || v === 'none' || v === 'unknown';
        });
      } else if (verdictFilter === 'real_unknown') {
        next = next.filter(r => getGptResponseKind(gptResults[r.request_id]) === 'unknown');
      } else if (verdictFilter === 'real_missing') {
        next = next.filter(r => getGptResponseKind(gptResults[r.request_id]) === 'missing');
      } else if (verdictFilter === 'false_unknown') {
        next = next.filter(r => getGptResponseKind(gptResults[r.request_id]) === 'existing');
      } else if (verdictFilter === 'gpt_error') {
        next = next.filter(r => Boolean(gptResults[r.request_id]?.error));
      } else if (verdictFilter === 'weak_signal') {
        next = next.filter(r =>
          (r.pred_subtype_2 || '') === PS2_MISSING &&
          getGptResponseKind(gptResults[r.request_id]) === 'unknown'
        );
      } else if (verdictFilter === 'false_missing') {
        next = next.filter(r => {
          const isPredMissing = (r.pred_subtype_2 || '') === PS2_MISSING;
          return isPredMissing && getGptResponseKind(gptResults[r.request_id]) === 'existing';
        });
      } else if (verdictFilter === 'truly_unknown') {
        next = next.filter(r => getGptResponseKind(gptResults[r.request_id]) === 'unknown');
      } else if (verdictFilter === 'true_missing_subtype') {
        next = next.filter(r => getGptResponseKind(gptResults[r.request_id]) === 'missing');
      } else if (verdictFilter === 'missing_but_mappable') {
        next = next.filter(r => getGptResponseKind(gptResults[r.request_id]) === 'existing');
      } else if (verdictFilter === 'wrong_subtype') {
        next = next.filter(r => getGptResponseKind(gptResults[r.request_id]) === 'existing');
      } else {
        next = next.filter(r => verdicts[r.request_id] === verdictFilter);
      }
    }

    const counts = next.reduce((acc, record) => {
      const subtype = String(verdicts[record.request_id] || '').trim();
      const key = subtype ? subtype : '__EMPTY__';
      acc.set(key, (acc.get(key) || 0) + 1);
      return acc;
    }, new Map());

    return Array.from(counts.entries())
      .map(([value, count]) => ({
        value,
        count,
        label: value === '__EMPTY__' ? NOT_RETAGGED_LABEL : value,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  }, [
    preparedRecords,
    gridFilter,
    verdicts,
    subtypeToType,
    requestIdFilter,
    predSubtypeFilter,
    attributesFilter,
    metadataFilter,
    gptSubtypeFilter,
    trueSubtypeFilter,
    verdictFilter,
    gptResults,
  ]);

  /* ── filtering + sorting (memoized for large datasets) ── */
  const filtered = useMemo(() => {
    let next = preparedRecords;

    if (gridFilter && (gridFilter.trueType !== null || gridFilter.trueSubtype !== null || gridFilter.predSubtype !== null)) {
      next = next.filter(r => {
        const trueSubtype = verdicts[r.request_id] ?? '';
        const trueType = trueSubtype === '' ? NOT_RETAGGED_LABEL : (subtypeToType[trueSubtype] || '');

        if (gridFilter.trueType !== null && gridFilter.trueType !== undefined && trueType !== gridFilter.trueType) return false;
        if (gridFilter.trueSubtype !== null && gridFilter.trueSubtype !== undefined && trueSubtype !== gridFilter.trueSubtype) return false;
        if (gridFilter.predSubtype === '__cross_type__' && r.pred_type === trueType) return false;
        if (gridFilter.predSubtype && gridFilter.predSubtype !== '__cross_type__' && r.pred_subtype !== gridFilter.predSubtype) return false;
        return true;
      });
    }

    if (requestIdFilter) next = next.filter(r => r.__requestIdLower.includes(requestIdFilter));
    if (predSubtypeFilter) next = next.filter(r => r.__stage1Lower.includes(predSubtypeFilter));
    if (attributesFilter) next = next.filter(r => r.__attributesLower.includes(attributesFilter));
    if (metadataFilter) next = next.filter(r => r.__metadataLower.includes(metadataFilter));
    if (gptSubtypeFilter.length > 0) {
      next = next.filter(r => {
        const subtype = getGptSubtype(gptResults[r.request_id]);
        return gptSubtypeFilter.some(selected => selected === '__EMPTY__' ? !subtype : subtype === selected);
      });
    }
    if (trueSubtypeFilter.length > 0) {
      next = next.filter(r => {
        const subtype = String(verdicts[r.request_id] || '').trim();
        return trueSubtypeFilter.some(selected => selected === '__EMPTY__' ? !subtype : subtype === selected);
      });
    }

    if (verdictFilter !== 'all') {
      if (verdictFilter === 'untagged') {
        next = next.filter(r => !verdicts[r.request_id]);
      } else if (verdictFilter === 'only_missing') {
        next = next.filter(r => {
          const v = r.__missingSubtypeLower;
          return v !== '' && v !== 'none' && v !== 'unknown';
        });
      } else if (verdictFilter === 'only_unknown') {
        next = next.filter(r => {
          const v = r.__missingSubtypeLower;
          return v === '' || v === 'none' || v === 'unknown';
        });
      } else if (verdictFilter === 'real_unknown') {
        next = next.filter(r => getGptResponseKind(gptResults[r.request_id]) === 'unknown');
      } else if (verdictFilter === 'real_missing') {
        next = next.filter(r => getGptResponseKind(gptResults[r.request_id]) === 'missing');
      } else if (verdictFilter === 'false_unknown') {
        next = next.filter(r => getGptResponseKind(gptResults[r.request_id]) === 'existing');
      } else if (verdictFilter === 'gpt_error') {
        next = next.filter(r => Boolean(gptResults[r.request_id]?.error));
      } else if (verdictFilter === 'weak_signal') {
        next = next.filter(r =>
          (r.pred_subtype_2 || '') === PS2_MISSING &&
          getGptResponseKind(gptResults[r.request_id]) === 'unknown'
        );
      } else if (verdictFilter === 'false_missing') {
        next = next.filter(r => {
          const isPredMissing = (r.pred_subtype_2 || '') === PS2_MISSING;
          return isPredMissing && getGptResponseKind(gptResults[r.request_id]) === 'existing';
        });
      } else if (verdictFilter === 'truly_unknown') {
        next = next.filter(r => getGptResponseKind(gptResults[r.request_id]) === 'unknown');
      } else if (verdictFilter === 'true_missing_subtype') {
        next = next.filter(r => getGptResponseKind(gptResults[r.request_id]) === 'missing');
      } else if (verdictFilter === 'missing_but_mappable') {
        next = next.filter(r => getGptResponseKind(gptResults[r.request_id]) === 'existing');
      } else if (verdictFilter === 'wrong_subtype') {
        next = next.filter(r => getGptResponseKind(gptResults[r.request_id]) === 'existing');
      } else {
        next = next.filter(r => verdicts[r.request_id] === verdictFilter);
      }
    }

    if (sortConfig.key) {
      next = [...next].sort((a, b) => {
        let aVal;
        let bVal;
        if (sortConfig.key === 'verdict') {
          aVal = verdicts[a.request_id] || '';
          bVal = verdicts[b.request_id] || '';
        } else if (sortConfig.key === 'true_type') {
                getGptResponseKind(gptResults[r.request_id]) === 'unknown'
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
          aVal = getGptResponseKind(gptResults[a.request_id]) || '';
          bVal = getGptResponseKind(gptResults[b.request_id]) || '';
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

    return next;
  }, [
    preparedRecords,
    gridFilter,
    verdicts,
    subtypeToType,
    requestIdFilter,
    predSubtypeFilter,
    attributesFilter,
    metadataFilter,
    gptSubtypeFilter,
    trueSubtypeFilter,
    verdictFilter,
    gptResults,
    sortConfig,
  ]);

  const effectivePageSize = pageSize === 'All' ? filtered.length : pageSize;
  const pageData = useMemo(
    () => filtered.slice(currentPage * effectivePageSize, (currentPage + 1) * effectivePageSize),
    [filtered, currentPage, effectivePageSize]
  );
  const hasAnyGptInFiltered = useMemo(
    () => filtered.some(r => gptResults[r.request_id]),
    [filtered, gptResults]
  );
  const totalPages = pageSize === 'All' ? 1 : Math.ceil(filtered.length / effectivePageSize);

  /* ── stats (single memoized pass) ── */
  const {
    total,
    gptReviewedCount,
    retaggedCount,
    anyReviewedCount,
    onlyMissingCount,
    onlyUnknownCount,
    untaggedCount,
    falseUnknownCount,
    falseMissingCount,
    gptErrorCount,
  } = useMemo(() => {
    const acc = {
      total: preparedRecords.length,
      gptReviewedCount: 0,
      retaggedCount: 0,
      anyReviewedCount: 0,
      noGptAskedCount: 0,
      onlyMissingCount: 0,
      onlyUnknownCount: 0,
      untaggedCount: 0,
      falseUnknownCount: 0,
      falseMissingCount: 0,
      gptErrorCount: 0,
      weakSignalCount: 0,
    };

    preparedRecords.forEach(r => {
      const verdict = verdicts[r.request_id];
      const gptDecision = getGptResponseKind(gptResults[r.request_id]);
      const missing = r.__missingSubtypeLower;

      if (verdict) {
        acc.retaggedCount++;
      } else {
        acc.untaggedCount++;
      }

      if (gptResults[r.request_id]) {
        acc.gptReviewedCount++;
        acc.anyReviewedCount++;
      } else {
        acc.noGptAskedCount++;
        if (verdict) acc.anyReviewedCount++;
      }

      if (missing === '' || missing === 'none' || missing === 'unknown') acc.onlyUnknownCount++;
      else acc.onlyMissingCount++;

      if (gptDecision === 'existing') acc.falseUnknownCount++;
      if ((r.pred_subtype_2 || '') === PS2_MISSING && gptDecision === 'existing') acc.falseMissingCount++;
      if (gptResults[r.request_id]?.error) acc.gptErrorCount++;
      if ((r.pred_subtype_2 || '') === PS2_MISSING && gptDecision === 'unknown') acc.weakSignalCount++;
    });

    return acc;
  }, [preparedRecords, verdicts, gptResults]);

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

  const parseExistingTranslation = (value) => {
    if (value === null || value === undefined) return { parsed: null, valid: false };
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return { parsed: null, valid: false };
      try {
        return { parsed: JSON.parse(trimmed), valid: true };
      } catch {
        return { parsed: null, valid: false };
      }
    }
    return { parsed: value, valid: true };
  };

  const hasMeaningfulJson = (value) => {
    const { parsed, valid } = parseExistingTranslation(value);
    if (!valid) return false;
    const pruned = pruneEmptyJsonValue(parsed);
    return pruned !== undefined;
  };

  const hasExistingTranslation = (record, field) => {
    const override = translatedOverrides[record.request_id] || {};
    const translatedValue = field === 'attributes'
      ? (override.en_attributes ?? record.en_attributes)
      : (override.en_metadata ?? record.en_metadata);
    return hasMeaningfulJson(translatedValue);
  };

  const translateFilteredField = async (field) => {
    if (translateState.running) return;
    const rows = filtered;
    if (!rows.length) return;
    const rowsToTranslate = rows.filter(r => !hasExistingTranslation(r, field));

    if (field === 'attributes') setAttrLang('en');
    if (field === 'metadata') setMetaLang('en');

    if (!rowsToTranslate.length) {
      setToast(`${field === 'attributes' ? 'Attributes' : 'Metadata'} already translated for current rows`);
      return;
    }

    setTranslateState({ running: true, field, done: 0, total: rowsToTranslate.length });

    const payload = {
      field,
      records: rowsToTranslate.map(r => ({
        request_id: r.request_id,
        attributes: r.attributes,
        metadata: r.metadata,
        en_attributes: translatedOverrides[r.request_id]?.en_attributes ?? r.en_attributes,
        en_metadata: translatedOverrides[r.request_id]?.en_metadata ?? r.en_metadata,
      })),
    };

    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok || !res.body) {
        const text = await res.text();
        throw new Error(text || `Translate failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';

        for (const chunk of chunks) {
          const line = chunk.split('\n').find(l => l.startsWith('data: '));
          if (!line) continue;
          const data = JSON.parse(line.slice(6));
          const total = Number(data.total || rowsToTranslate.length);
          const doneCount = Number(data.done || 0);

          setTranslateState({ running: !Boolean(data.finished), field, done: doneCount, total });

          if (data.request_id && data.attrsEn) {
            setTranslatedOverrides(prev => ({
              ...prev,
              [data.request_id]: {
                ...(prev[data.request_id] || {}),
                [field === 'attributes' ? 'en_attributes' : 'en_metadata']: data.attrsEn,
              },
            }));
          }

          if (data.finished) {
            setToast(`${field === 'attributes' ? 'Attributes' : 'Metadata'} translation finished (${total}/${total})`);
          }
        }
      }
    } catch (err) {
      setToast(`Translate failed: ${err.message || 'unknown error'}`);
    } finally {
      setTranslateState(prev => ({ ...prev, running: false, field: null }));
    }
  };

  /* ── ask GPT (filtered records only) ── */
  const askGptForRecord = async (record, { quick = false } = {}) => {
    const requestId = record.request_id;
    const traceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const updateSeq = ++gptLoadSeqRef.current;
    gptRowUpdateSeqRef.current[String(requestId)] = updateSeq;
    setAskGptLoading(prev => ({ ...prev, [requestId]: true }));
    const predictedStatus = String(record.pred_subtype_2 || '').trim().toLowerCase();
    const previousResult = gptResults[requestId] || null;
    const previousSubtypeState = getGptSubtypeState(previousResult);
    const showAskWarning = (message) => {
      const fullMessage = `[${traceId}] ${message}`;
      LOG.warn(fullMessage);
      if (onWarning) onWarning(message);
    };

    LOG.info(`[${traceId}] ── START request_id=${requestId} run_id=${runId} quick=${quick} predicted_status=${predictedStatus}`,
      `| update_seq=${updateSeq}`,
      `| previous_gpt_subtype="${previousSubtypeState.text || '(none)'}" previous_condition=${previousSubtypeState.condition}`,
      `| attributes=${JSON.stringify(summarizePayloadShape(record.attributes))} metadata=${JSON.stringify(summarizePayloadShape(record.metadata))}`);

    let result;
    try {
      const allowedSubtypes = quick ? [] : (countrySubtypes || []).map(o => o.subtype).filter(Boolean).map(s => s.toLowerCase());
      const attributes = getJsonCellState(record.attributes).prunedValue;
      const metadata = getJsonCellState(record.metadata).prunedValue;
      LOG.debug(`[${traceId}] payload allowed_subtypes=${allowedSubtypes.length} | attributes=${JSON.stringify(summarizePayloadShape(attributes))} metadata=${JSON.stringify(summarizePayloadShape(metadata))}`
      );
      const res = await fetch('/api/ask-gpt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          judge_mode: true,
          attributes,
          metadata,
          predicted_status: predictedStatus,
          pred_type: record.pred_type || '',
          pred_subtype: record.pred_subtype || '',
          stage2_subtype: record.pred_subtype_2 || '',
          candidate_subtype: record.pred_subtype_1 || record.pred_subtype || '',
          missing_subtype: record.missing_subtype || '',
          allowed_subtypes: allowedSubtypes,
        }),
      });
      if (res.ok) {
        LOG.info(`[${traceId}] /api/ask-gpt response status=${res.status} ok=true`);
      } else {
        LOG.warn(`[${traceId}] /api/ask-gpt response status=${res.status} ok=false`);
      }
      const data = await res.json();
      LOG.debug(`[${traceId}] /api/ask-gpt raw body=${clipLogText(JSON.stringify(data))}`);
      if (data.response_kind === 'error' || data.error) {
        result = {
          text: '',
          rawResponse: data.raw_response || '',
          subtype: null,
          decision: null,
          responseKind: data.response_kind || 'error',
          suggestedSubtype: data.suggested_subtype || `ERROR_${res.status || 'UNKNOWN'}`,
          gptSubtype: '',
          mappedAllowedSubtype: '',
          suggestedMissingSubtype: '',
          reason: data.reasoning || '',
          error: data.error || data.suggested_subtype || `ERROR_${res.status || 'UNKNOWN'}`,
        };
        showAskWarning(`Ask GPT returned an error for request ${requestId}: ${result.error}. The GPT subtype will be saved as an error marker.`);
      } else {
        result = {
          text: data.text || '',
          rawResponse: data.raw_response || '',
          subtype: data.decision || data.subtype || data.verdict || null,
          decision: data.decision || data.subtype || data.verdict || null,
          responseKind: data.response_kind || '',
          suggestedSubtype: data.suggested_subtype || '',
          gptSubtype: '',
          mappedAllowedSubtype: data.mapped_allowed_subtype || '',
          suggestedMissingSubtype: data.suggested_missing_subtype || '',
          reason: data.reason || data.reasoning || '',
          error: null,
        };
      }
    } catch (err) {
      LOG.error(`[${traceId}] fetch failed message=${err.message}`);
      LOG.debug(`[${traceId}] fetch error stack=${clipLogText(err.stack || '', 1500)}`);
      result = {
        text: '',
        rawResponse: '',
        subtype: null,
        decision: null,
        responseKind: 'error',
        suggestedSubtype: 'ERROR_FETCH',
        gptSubtype: '',
        mappedAllowedSubtype: '',
        suggestedMissingSubtype: '',
        reason: '',
        error: err.message || '(error)',
      };
      showAskWarning(`Ask GPT fetch failed for request ${requestId}: ${result.error}. The GPT subtype will be saved as ERROR_FETCH.`);
    }

    if (result.error) {
      LOG.warn(`[${traceId}] result has error — error=${result.error}`);
    } else {
      LOG.info(
        `[${traceId}] ── RESULT response_kind=${String(result.responseKind || '').trim() || '(empty)'}` +
        ` | suggested_subtype=${String(result.suggestedSubtype || '').trim() || '(empty)'}` +
        ` | gptSubtype=${String(result.gptSubtype || '').trim() || '(empty)'}` +
        ` | reason_chars=${String(result.reason || result.text || '').length}`
      );
      LOG.debug(`[${traceId}] raw_response=${clipLogText(result.rawResponse || '')}`);
    }

    LOG.info(`[${traceId}] ── CALLING getGptSubtypeState with result: responseKind="${result.responseKind || ''}", suggestedSubtype="${result.suggestedSubtype || ''}", gptSubtype="${result.gptSubtype || ''}"`);
    const subtypeState = getGptSubtypeState(result);
    LOG.info(`[${traceId}] ── getGptSubtypeState RETURNED: text="${subtypeState.text}", source="${subtypeState.source}", condition="${subtypeState.condition}"`);
    const gptSubtype = subtypeState.text;
    const gptSuggested = getGptSuggestedVerdict(result, countrySubtypes);
    const gptSource = subtypeState.source;
    result = { ...result, gptSubtype };
    if (onWarning) {
      onWarning(
        `GPT subtype UI update attempt for request ${requestId}: "${previousSubtypeState.text || '(none)'}" -> "${gptSubtype || '(empty)'}" ` +
        `(source=${gptSource}, condition=${subtypeState.condition}).`
      );
    }
    LOG.info(
      `[${traceId}] ── GPT SUBTYPE CHANGE ATTEMPT UI_STATE` +
      ` request_id=${requestId} run_id=${runId}` +
      ` previous="${previousSubtypeState.text || '(none)'}"` +
      ` next="${gptSubtype || '(empty)'}"` +
      ` source=${gptSource}` +
      ` condition=${subtypeState.condition}`
    );
    setGptResults(prev => ({ ...prev, [requestId]: { ...result } }));
    LOG.debug(`[${traceId}] setGptResults done request_id=${requestId} gpt_subtype="${gptSubtype}"`);
    LOG.info(
      `[${traceId}] ── UI GPT SUBTYPE text="${gptSubtype || '(empty)'}" source=${gptSource} condition=${subtypeState.condition}` +
      ` suggested_verdict="${gptSuggested || '(none)'}" can_accept=${Boolean(gptSuggested)}`
    );
    if (!gptSubtype) {
      showAskWarning(`GPT subtype was empty after Ask GPT for request ${requestId}; this should never happen.`);
    } else if (result.error) {
      showAskWarning(`Ask GPT produced warning/error for request ${requestId}; displaying and saving GPT subtype "${gptSubtype}".`);
    }

    if (previousSubtypeState.text === gptSubtype) {
      showAskWarning(
        `GPT subtype is unchanged for request ${requestId}: "${gptSubtype || '(empty)'}"` +
        ` (previous=${previousSubtypeState.condition}, new=${subtypeState.condition}).`
      );
    } else {
      LOG.info(
        `[${traceId}] GPT SUBTYPE changed "${previousSubtypeState.text || '(none)'}" -> "${gptSubtype || '(empty)'}"` +
        ` prev_condition=${previousSubtypeState.condition} new_condition=${subtypeState.condition}`
      );
    }

    const legacyVerdict = result.error ? '' : toLegacyYesNo(result.responseKind || result.decision || result.subtype, predictedStatus);
    const structuredReasoning = JSON.stringify({
      response_kind: result.responseKind || '',
      suggested_subtype: result.suggestedSubtype || '',
      decision: result.decision || result.subtype || '',
      mapped_allowed_subtype: result.mappedAllowedSubtype || '',
      suggested_missing_subtype: result.suggestedMissingSubtype || '',
      gpt_subtype: gptSubtype,
      reasoning: result.text || result.reason || (result.error ? `Error: ${result.error}` : ''),
      raw_response: result.rawResponse || '',
      error: result.error || null,
    });
    const persistPayload = {
      run_id: runId,
      results: {
        [requestId]: {
          verdict: legacyVerdict,
          reasoning: structuredReasoning,
          gpt_subtype: gptSubtype,
        },
      },
    };

    LOG.info(
      `[${traceId}] ── PERSIST START /api/gpt-results` +
      ` request_id=${requestId} run_id=${runId}` +
      ` legacy_verdict="${legacyVerdict || '(empty)'}"` +
      ` gpt_subtype="${gptSubtype || '(empty)'}"` +
      ` reasoning_chars=${structuredReasoning.length}`
    );
    LOG.info(
      `[${traceId}] ── GPT SUBTYPE CHANGE ATTEMPT PERSIST` +
      ` request_id=${requestId} run_id=${runId}` +
      ` previous="${previousSubtypeState.text || '(none)'}"` +
      ` next="${gptSubtype || '(empty)'}"`
    );
    if (onWarning) {
      onWarning(
        `GPT subtype save attempt for request ${requestId}: "${previousSubtypeState.text || '(none)'}" -> "${gptSubtype || '(empty)'}".`
      );
    }
    LOG.debug(`[${traceId}] persist payload=${clipLogText(JSON.stringify(persistPayload), 2000)}`);

    try {
      const persistRes = await fetch('/api/gpt-results', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(persistPayload),
      });
      const persistData = await persistRes.json().catch(() => ({}));
      LOG.info(
        `[${traceId}] ── PERSIST RESPONSE status=${persistRes.status} ok=${persistRes.ok}` +
        ` body=${clipLogText(JSON.stringify(persistData), 1200)}`
      );
      if (!persistRes.ok || persistData.error) {
        throw new Error(persistData.error || `Persist failed (${persistRes.status})`);
      }
      if (Array.isArray(persistData.missing_request_ids) && persistData.missing_request_ids.length > 0) {
        showAskWarning(`GPT subtype save for request ${requestId} reported missing row(s): ${persistData.missing_request_ids.join(', ')}`);
      }
      LOG.info(
        `[${traceId}] ── GPT SUBTYPE SUCCESSFULLY UPDATED` +
        ` request_id=${requestId} run_id=${runId} gpt_subtype="${gptSubtype}"`
      );
      if (onGptResultsUpdated) onGptResultsUpdated();
    } catch (persistErr) {
      showAskWarning(`GPT subtype was generated for request ${requestId}, but saving it failed: ${persistErr?.message || 'unknown error'}`);
      LOG.error(`[${traceId}] PERSIST failed request_id=${requestId} message=${persistErr?.message || '(unknown)'}`);
    } finally {
      setAskGptLoading(prev => ({ ...prev, [requestId]: false }));
      LOG.info(`[${traceId}] ── DONE request_id=${requestId}`);
    }
  };

  const askGptAll = async (recordsToProcess) => {
    gptCancelledRef.current = false;
    if (!recordsToProcess || recordsToProcess.length === 0) return;
    setGptRunning(true);
    setGptProgress({ done: 0, total: recordsToProcess.length });
    for (const record of recordsToProcess) {
      if (gptCancelledRef.current) break;
      await askGptForRecord(record);
      setGptProgress(prev => ({ ...prev, done: prev.done + 1 }));
    }
    setGptRunning(false);
  };

  const askGptErrors = async (recordsToProcess) => {
    gptCancelledRef.current = false;
    const errored = recordsToProcess.filter(r => gptResults[r.request_id]?.error);
    if (errored.length === 0) return;
    setGptRunning(true);
    setGptProgress({ done: 0, total: errored.length });
    for (const record of errored) {
      if (gptCancelledRef.current) break;
      await askGptForRecord(record);
      setGptProgress(prev => ({ ...prev, done: prev.done + 1 }));
    }
    setGptRunning(false);
  };

  const askGptAllQuick = async (recordsToProcess) => {
    gptCancelledRef.current = false;
    if (!recordsToProcess || recordsToProcess.length === 0) return;
    setGptRunning(true);
    setGptProgress({ done: 0, total: recordsToProcess.length });
    for (const record of recordsToProcess) {
      if (gptCancelledRef.current) break;
      await askGptForRecord(record, { quick: true });
      setGptProgress(prev => ({ ...prev, done: prev.done + 1 }));
    }
    setGptRunning(false);
  };

  const handleBulkAcceptGpt = (recordsToProcess) => {
    const bulkVerdicts = {};
    recordsToProcess.forEach(r => {
      const gpt = gptResults[r.request_id];
      const suggested = getGptSuggestedVerdict(gpt, countrySubtypes);
      if (suggested) bulkVerdicts[r.request_id] = suggested;
    });
    if (Object.keys(bulkVerdicts).length > 0) onBulkVerdict(bulkVerdicts);
  };

  const handleClearEmptyGptSubtype = async () => {
    if (!runId) return;
    setClearingEmptyGpt(true);
    try {
      const res = await fetch('/api/gpt-results/clean-empty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: runId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to clear empty GPT subtype');
      setToast(`Cleared ${data.updated || 0} empty GPT subtype value(s)`);
      if (onGptResultsUpdated) onGptResultsUpdated();
    } catch (err) {
      setToast(`Clear failed: ${err.message || 'unknown error'}`);
    } finally {
      setClearingEmptyGpt(false);
    }
  };

  const handleClearRunData = async () => {
    if (!runId) return;
    if (!window.confirm('Clear ALL GPT results and human tags for this run? This cannot be undone.')) return;
    setClearingRunData(true);
    try {
      const res = await fetch('/api/clear-run-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: runId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to clear run data');
      setGptResults({});
      if (onGptResultsUpdated) onGptResultsUpdated();
      setToast(`Cleared ${data.gptCleared} GPT + ${data.humanCleared} human tags`);
    } catch (err) {
      setToast(`Clear failed: ${err.message || 'unknown error'}`);
    } finally {
      setClearingRunData(false);
    }
  };

  /* ── json rendering ── */
  const copyCellJson = (obj, label, cellKey) => {
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2)).then(() => {
      setToast(`${label} copied!`);
      setCopiedCell(cellKey);
      setTimeout(() => setCopiedCell(null), 1000);
    }).catch(() => setToast(`Failed to copy ${label}`));
  };

  const toggleJsonCell = (cellKey) => {
    setExpandedJsonCells(prev => ({ ...prev, [cellKey]: !prev[cellKey] }));
  };

  const renderPrettyJson = (raw, cellKey, label) => {
    const { fullValue, prunedValue, fullDisplay, prunedDisplay, isEmpty, hasHiddenValues } = getJsonCellState(raw);
    const isExpanded = Boolean(expandedJsonCells[cellKey]);
    const display = isExpanded ? fullDisplay : prunedDisplay;
    const valueToCopy = isExpanded ? fullValue : prunedValue;

    if (isEmpty) return <div className="json-empty">(empty)</div>;

    return (
      <div className="json-cell-wrapper">
        <div className="json-cell-actions">
          {hasHiddenValues && (
            <button
              className="toggle-json-btn"
              onClick={e => { e.stopPropagation(); toggleJsonCell(cellKey); }}
              title={isExpanded ? `Show only non-empty ${label.toLowerCase()}` : `Show full ${label.toLowerCase()} JSON`}
            >
              {isExpanded ? 'Show filtered JSON' : 'Show full JSON'}
            </button>
          )}
          <button className="copy-json-btn" onClick={e => { e.stopPropagation(); copyCellJson(valueToCopy, label, cellKey); }}>
            {copiedCell === cellKey ? 'Copied ✔' : 'Copy'}
          </button>
        </div>
        <pre className="json-pretty">{display}</pre>
      </div>
    );
  };

  const renderExpandableResultFields = (raw, label) => {
    if (!raw || typeof raw !== 'object') return <div className="json-empty">(empty)</div>;

    const entries = Object.entries(raw);
    if (entries.length === 0) return <div className="json-empty">(empty)</div>;

    const responseKind = String(raw.response_kind || raw.responseKind || '').trim();
    const suggestedSubtype = String(raw.suggested_subtype || raw.suggestedSubtype || raw.gptSubtype || '').trim();
    const rawError = String(raw.error || '').trim();
    const friendlyError = rawError ? explainGptError(rawError) : '';
    const summaryParts = [responseKind, suggestedSubtype].filter(Boolean);

    return (
      <details className="gpt-result-viewer">
        <summary className="gpt-result-summary">
          <span className="gpt-result-summary-title">{summaryParts.length > 0 ? summaryParts.join(' | ') : `View ${label}`}</span>
          <span className="gpt-result-summary-meta">{entries.length} field{entries.length === 1 ? '' : 's'}</span>
        </summary>
        <div className="gpt-result-fields">
          {friendlyError && (
            <div className="gpt-result-row">
              <div className="gpt-result-key">error_message</div>
              <div className="gpt-result-value">{friendlyError}</div>
            </div>
          )}
          {entries.map(([key, value]) => {
            let displayValue;
            if (value === null) {
              displayValue = 'null';
            } else if (typeof value === 'object') {
              displayValue = JSON.stringify(value, null, 2);
            } else {
              displayValue = String(value);
            }
            return (
              <div key={key} className="gpt-result-row">
                <div className="gpt-result-key">{key}</div>
                <div className="gpt-result-value">{displayValue || '(empty)'}</div>
              </div>
            );
          })}
        </div>
      </details>
    );
  };

  /* ── export ── */
  const doExport = (kind) => {
    const headers = ['request_id', 'pred_subtype_1', 'fewshots', 'gpt_verdict', 'gpt_reason', 'true_subtype', 'attributes', 'metadata'];
    const rows = filtered.map(r => {
      const gpt = gptResults[r.request_id];
      const stage1 = r.pred_subtype_1 || r.pred_subtype || '';
      return [r.request_id, stage1, (r.feshots || r.fewshots || []).join(', '), getGptResponseKind(gpt) || '', gpt?.reason || gpt?.text || '', verdicts[r.request_id] || '', JSON.stringify(r.attributes ?? ''), JSON.stringify(r.metadata ?? '')];
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

      <div className="validation-toolbar validation-toolbar-retag" ref={toolbarRef}>
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
        <div className="validation-verdict-tabs">
          {[
            { key: 'all',           label: 'all',           count: total,              title: 'All records in this run' },
            { key: 'untagged',      label: 'Untagged',      count: untaggedCount,      title: 'Records that have not yet been assigned a true subtype by a human reviewer' },
            { key: 'only_missing',  label: 'missing',       count: onlyMissingCount,   title: 'Records with a concrete missing subtype value (excluding empty/None/unknown)' },
            { key: 'only_unknown',  label: 'unknowns',      count: onlyUnknownCount,   title: 'Records with missing subtype empty, None, or unknown' },
            { key: 'false_unknown', label: 'False Unknowns', count: falseUnknownCount,  title: 'Classifier flagged these as low-signal unknowns, but GPT detected a recognisable content pattern — they may belong to an existing or mappable subtype' },
            { key: 'false_missing', label: 'False Knowns',  count: falseMissingCount,  title: 'Records predicted as missing, but GPT judged them as belonging to an existing subtype' },
            { key: 'gpt_error',     label: 'GPT errors',    count: gptErrorCount,      title: 'Records where GPT returned malformed or failed output and the review could not be parsed' },
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

        {/* Row height, export, ask gpt */}
        <>
          <div className="row-height-control">
            <span className="row-height-label">Row height:</span>
            {ROW_HEIGHT_OPTIONS.map(opt => (
              <button key={opt} className={`row-height-btn${rowHeight === opt ? ' active' : ''}`} onClick={() => setRowHeight(opt)}>{opt}</button>
            ))}
          </div>
          <button
            className="export-csv-btn ask-gpt-btn"
            disabled={clearingEmptyGpt}
            title="Delete empty GPT subtype values from this run"
            onClick={handleClearEmptyGptSubtype}
          >
            {clearingEmptyGpt ? 'Deleting…' : 'Delete empty GPT subtype'}
          </button>
          <button
            className="export-csv-btn ask-gpt-btn"
            disabled={clearingRunData}
            title="Clear all GPT results and human tags for this run"
            onClick={handleClearRunData}
          >
            {clearingRunData ? 'Clearing…' : 'Clear All Data'}
          </button>
          <a
            className="export-csv-btn ask-gpt-btn"
            href={`/api/export-csv?run_id=${runId}`}
            download
            title="Download full run as CSV with updated true_subtype values"
          >
            CSV
          </a>
          <button
            className="export-csv-btn ask-gpt-btn"
            disabled={publishState === 'loading'}
            title="Copy this run to Postgres as {name}_retagged"
            onClick={onPublishRetagged}
          >
            {publishState === 'loading' ? 'POSTGRES…'
              : publishState === 'done'    ? 'POSTGRES ✓'
              : publishState === 'error'   ? 'POSTGRES ✗'
              : 'POSTGRES'}
          </button>
          <button
            className="export-csv-btn ask-gpt-btn"
            onClick={() => handleBulkAcceptGpt(filtered)}
            disabled={gptRunning || !hasAnyGptInFiltered}
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
          {gptErrorCount > 0 && (
            <button
              className="export-csv-btn ask-gpt-btn ask-gpt-errors-btn"
              onClick={() => askGptErrors(filtered)}
              disabled={gptRunning}
              title={`Re-run GPT for ${gptErrorCount} errored record(s)`}
            >
              Re-run Errors ({gptErrorCount})
            </button>
          )}
          {gptRunning && (
            <button className="export-csv-btn ask-gpt-cancel-btn" onClick={() => { gptCancelledRef.current = true; }}>
              Cancel
            </button>
          )}
        </>
      </div>

      {/* Table */}
      <div className="validation-table-wrap">
        <table className="validation-table records-table">
          <thead>
            {/* Column headers */}
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
                      <button
                        className={`attr-lang-btn attr-lang-gpt-btn${translateState.running && translateState.field === 'attributes' ? ' active' : ''}`}
                        onClick={() => translateFilteredField('attributes')}
                        disabled={translateState.running}
                        title="Translate filtered Attributes with GPT"
                      >
                        {translateState.running && translateState.field === 'attributes'
                          ? `GPT ${translateState.done}/${translateState.total}`
                          : 'GPT'}
                      </button>
                    </div>
                  </div>
                </th>
                <th style={{ width: 250 }}>
                  <div className="header-cell">
                    Metadata
                    <div className="attr-lang-toggle" onClick={e => e.stopPropagation()}>
                      <button className={`attr-lang-btn${metaLang === 'original' ? ' active' : ''}`} onClick={() => setMetaLang('original')}>orig</button>
                      <button className={`attr-lang-btn${metaLang === 'en' ? ' active' : ''}`} onClick={() => setMetaLang('en')}>EN</button>
                      <button
                        className={`attr-lang-btn attr-lang-gpt-btn${translateState.running && translateState.field === 'metadata' ? ' active' : ''}`}
                        onClick={() => translateFilteredField('metadata')}
                        disabled={translateState.running}
                        title="Translate filtered Metadata with GPT"
                      >
                        {translateState.running && translateState.field === 'metadata'
                          ? `GPT ${translateState.done}/${translateState.total}`
                          : 'GPT'}
                      </button>
                    </div>
                  </div>
                </th>
                <th style={{ width: 170, cursor: 'pointer' }} onClick={() => handleSort('missing_subtype')}>
                  Missing Subtype{sortIndicator('missing_subtype')}
                </th>
                <th style={{ width: 360, cursor: 'pointer' }} onClick={() => handleSort('gpt_verdict')}>
                  GPT Verdict{sortIndicator('gpt_verdict')}
                </th>
                <th style={{ width: 110, cursor: 'pointer' }} onClick={() => handleSort('gpt_subtype')}>
                  <div className="header-cell">
                    <span>GPT Subtype{sortIndicator('gpt_subtype')}</span>
                    <ValueCountFilterDropdown
                      values={colFilters.gpt_subtype}
                      options={gptSubtypeFilterOptions}
                      onChange={val => setColFilter('gpt_subtype', val)}
                      allLabel="All GPT subtypes"
                      compact
                      title="Filter GPT subtype"
                    />
                  </div>
                </th>
                <th style={{ width: 160, cursor: 'pointer' }} onClick={() => handleSort('verdict')}>
                  <div className="header-cell">
                    <span>True Subtype{sortIndicator('verdict')}</span>
                    <ValueCountFilterDropdown
                      values={colFilters.true_subtype}
                      options={trueSubtypeFilterOptions}
                      onChange={val => setColFilter('true_subtype', val)}
                      allLabel="All true subtypes"
                      emptyLabel={NOT_RETAGGED_LABEL}
                      compact
                      title="Filter true subtype"
                    />
                  </div>
                </th>
              </tr>
            {/* Column filters */}
            <tr className="col-filter-row">
              <th><input className="col-filter-input" placeholder="filter…" value={colFilters.request_id} onChange={e => setColFilter('request_id', e.target.value)} /></th>
              <th><input className="col-filter-input" placeholder="filter…" value={colFilters.attributes} onChange={e => setColFilter('attributes', e.target.value)} /></th>
              <th><input className="col-filter-input" placeholder="filter…" value={colFilters.metadata} onChange={e => setColFilter('metadata', e.target.value)} /></th>
              <th />
              <th />
              <th />
              <th />
            </tr>
          </thead>
          <tbody>
            {pageData.map(r => {
              const verdict = verdicts[r.request_id] || '';
              const gpt = gptResults[r.request_id];
              const gptSuggestedVerdict = getGptSuggestedVerdict(gpt, countrySubtypes);
              const canAcceptGpt = Boolean(gptSuggestedVerdict);
              const isGptAccepted = canAcceptGpt && verdict === gptSuggestedVerdict;
              const gptSubtypeText = getGptSubtype(gpt);
              const gptSubtypeLegendClass = getGptSubtypeLegendClass(gpt);
              const gptDisplayObject = gpt
                ? {
                    response_kind: getGptResponseKind(gpt) || null,
                    suggested_subtype: gptSubtypeText || null,
                    reasoning: gpt?.reason || gpt?.text || null,
                    error: gpt?.error || null,
                    raw_response: gpt?.rawResponse || null,
                    decision: gpt?.decision || null,
                    responseKind: gpt?.responseKind || null,
                    suggestedSubtype: gpt?.suggestedSubtype || null,
                    gptSubtype: gpt?.gptSubtype || null,
                    mappedAllowedSubtype: gpt?.mappedAllowedSubtype || null,
                    suggestedMissingSubtype: gpt?.suggestedMissingSubtype || null,
                  }
                : null;
              const attrData = attrLang === 'en'
                ? (translatedOverrides[r.request_id]?.en_attributes ?? r.en_attributes ?? null)
                : r.attributes;
              const metaData = metaLang === 'en'
                ? (translatedOverrides[r.request_id]?.en_metadata ?? r.en_metadata ?? null)
                : r.metadata;
              const stage1 = r.pred_subtype_1 || r.pred_subtype || '';

              return (
                <tr key={r.request_id}>
                  <td className="cell-request-id">{r.request_id}</td>
                  <td className="cell-json">{renderPrettyJson(attrData, `attr-${r.request_id}`, 'Attributes')}</td>
                  <td className="cell-json">{renderPrettyJson(metaData, `meta-${r.request_id}`, 'Metadata')}</td>
                  <td>{String(r.missing_subtype || '').trim() || 'None'}</td>
                  <td className="cell-gpt-verdict">
                    {gptDisplayObject ? renderExpandableResultFields(gptDisplayObject, 'GPT Verdict') : <div className="json-empty">(empty)</div>}
                    <button
                      className="ask-gpt-row-btn"
                      disabled={Boolean(askGptLoading[r.request_id])}
                      onClick={e => { e.stopPropagation(); askGptForRecord(r); }}
                    >
                      {askGptLoading[r.request_id] ? 'Asking…' : 'Ask GPT'}
                    </button>
                  </td>
                  <td className="cell-gpt-subtype">
                    {gptSubtypeText ? (
                      <button
                        type="button"
                        className={`gpt-subtype-pill is-${gptSubtypeLegendClass}${canAcceptGpt ? ' is-clickable' : ''}${isGptAccepted ? ' is-applied' : ''}`}
                        disabled={!canAcceptGpt}
                        onClick={() => {
                          if (!canAcceptGpt) return;
                          if (gptSuggestedVerdict === 'Missing') {
                            onSetVerdict(r.request_id, 'Missing');
                            return;
                          }
                          onSetVerdict(r.request_id, isGptAccepted ? '' : gptSuggestedVerdict);
                        }}
                        title={canAcceptGpt
                          ? isGptAccepted
                            ? 'GPT subtype is applied. Click to clear it.'
                            : `Click to apply GPT subtype: ${gptSuggestedVerdict === 'unknown' ? 'unknown (weak signal)' : gptSuggestedVerdict === 'Missing' ? `missing – "${String(gpt?.suggestedMissingSubtype || '').trim()}"` : gptSuggestedVerdict}`
                          : 'No GPT review available'}
                      >
                        {gptSubtypeText}
                      </button>
                    ) : (
                      <span className="gpt-subtype-pill is-empty">—</span>
                    )}
                  </td>
                  <td className="cell-verdict cell-retag">
                    <ValidationRecordDecisionControls
                      requestId={r.request_id}
                      verdict={verdict}
                      countrySubtypes={countrySubtypes}
                      onSetVerdict={onSetVerdict}
                    />
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
