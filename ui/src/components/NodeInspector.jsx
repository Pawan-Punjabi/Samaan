import { useState, useRef } from 'react';
import {
  Upload,
  Download,
  Printer,
  Search,
  AlertTriangle,
  Trash2,
  Plus,
  ArrowUpDown,
  EyeOff,
  Eye,
} from 'lucide-react';
import { uploadCsv } from '../api/client';

const STATUS_TAG = {
  Critical: 'tag-danger',
  Low: 'tag-warning',
  'Dead Stock': 'tag-neutral',
  Healthy: 'tag-success',
};

const FORMULA_PRESETS = [
  { label: 'Line Revenue', name: 'line_revenue', expr: 'quantity * unit_price' },
  { label: 'Gross Profit', name: 'gross_profit', expr: '(unit_price - cost_price) * quantity' },
  { label: 'Margin %', name: 'margin_pct', expr: '((unit_price - cost_price) / unit_price) * 100' },
];

function fmtVal(val) {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'number') {
    return Number.isInteger(val)
      ? val.toLocaleString()
      : val.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  }
  return String(val);
}

export default function NodeInspector({
  node,
  nodeResult,
  upstreamColumns,
  leftColumns,
  rightColumns,
  summaryMetrics,
  onUpdateNode,
  onDeleteNode,
  onExport,
}) {
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState(null);
  const [sortAsc, setSortAsc] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');
  const [focusedFormulaIdx, setFocusedFormulaIdx] = useState(0);
  const fileRef = useRef(null);

  if (!node) return null;

  const p = node.params || {};
  const cols = nodeResult?.columns || [];
  const colStats = nodeResult?.column_stats || [];
  const statMap = Object.fromEntries(colStats.map((s) => [s.name, s]));
  const rawRows = nodeResult?.rows || [];
  const availCols = upstreamColumns?.length ? upstreamColumns : cols;

  const filteredRows = rawRows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q));
  });

  const sortedRows = sortCol
    ? [...filteredRows].sort((a, b) => {
        const av = a[sortCol];
        const bv = b[sortCol];
        if (av === bv) return 0;
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        if (typeof av === 'number' && typeof bv === 'number') {
          return sortAsc ? av - bv : bv - av;
        }
        return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      })
    : filteredRows;

  const toggleSort = (col) => {
    if (sortCol === col) setSortAsc((s) => !s);
    else {
      setSortCol(col);
      setSortAsc(false);
    }
  };

  const handleFileUpload = async (file) => {
    if (!file) return;
    setUploadErr('');
    setUploading(true);
    try {
      const res = await uploadCsv(file);
      onUpdateNode(node.id, {
        params: {
          ...p,
          file_id: res.file_id,
          filename: res.filename,
          columns: res.columns,
          column_map: res.suggested_column_map || {},
          rename_columns: {},
          drop_columns: [],
        },
      });
    } catch (err) {
      setUploadErr(err.message);
    } finally {
      setUploading(false);
    }
  };

  // Normalized multi-item state helpers for Filter / Formula / Summarize
  const filterConditions = p.conditions?.length
    ? p.conditions
    : p.column
      ? [{ column: p.column, op: p.op || '=', value: p.value ?? '' }]
      : [{ column: availCols[0] || '', op: '=', value: '' }];

  const formulaItems = p.formulas?.length
    ? p.formulas
    : p.column_name
      ? [{ column_name: p.column_name, expression: p.expression || '' }]
      : [{ column_name: 'new_metric', expression: '' }];

  const groupByCols = Array.isArray(p.group_by)
    ? p.group_by
    : p.group_by
      ? [p.group_by]
      : [];

  const aggItems = p.aggregations?.length
    ? p.aggregations
    : [{ column: p.metric || availCols[0] || '*', func: p.func || 'SUM', alias: '' }];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 380px) 1fr', gap: 16, alignItems: 'start' }}>
      {/* Left Column: Analyst Controls */}
      <section className="panel no-print" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <input
            type="text"
            aria-label="Node step label"
            value={node.label}
            onChange={(e) => onUpdateNode(node.id, { label: e.target.value })}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--text)',
              fontFamily: 'inherit',
              flex: 1,
              minWidth: 0,
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {nodeResult && (
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-soft)' }}>
                {nodeResult.duration_ms}ms
              </span>
            )}
            <button
              type="button"
              className="btn"
              aria-label={`Delete ${node.label}`}
              onClick={() => onDeleteNode(node.id)}
              style={{ minHeight: 28, padding: '3px 7px', color: 'var(--danger)' }}
            >
              <Trash2 size={13} aria-hidden="true" />
            </button>
          </div>
        </div>

        {nodeResult?.error_message && (
          <div
            role="alert"
            style={{
              padding: '9px 11px',
              borderRadius: 6,
              background: 'var(--danger-soft)',
              border: '1px solid var(--danger)',
              color: 'var(--danger)',
              fontSize: 12.5,
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
            }}
          >
            <AlertTriangle size={15} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{nodeResult.error_message}</span>
          </div>
        )}

        {/* 1. INPUT CSV: Upload + Rename / Hide Columns */}
        {node.type === 'input_csv' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.xlsx,.xlsm,.parquet"
              style={{ display: 'none' }}
              onChange={(e) => handleFileUpload(e.target.files?.[0])}
            />
            <button type="button" className="btn btn-primary" disabled={uploading} onClick={() => fileRef.current?.click()} style={{ width: '100%' }}>
              <Upload size={14} aria-hidden="true" />
              {uploading ? 'Uploading…' : p.filename ? `Replace File (${p.filename})` : 'Upload CSV / Excel'}
            </button>
            {uploadErr && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{uploadErr}</div>}

            {(p.columns || []).length > 0 && (
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-soft)', marginBottom: 6 }}>
                  SCHEMA &amp; COLUMNS (RENAME OR HIDE)
                </div>
                <div style={{ maxHeight: 270, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(p.columns || []).map((c) => {
                    const mappedName = p.column_map?.[c.name] || c.name;
                    const renamed = p.rename_columns?.[mappedName] ?? '';
                    const isDropped = (p.drop_columns || []).includes(mappedName);
                    return (
                      <div key={c.name} style={{ display: 'grid', gridTemplateColumns: '1fr 125px 30px', gap: 6, alignItems: 'center', opacity: isDropped ? 0.5 : 1 }}>
                        <div>
                          <div className="mono" style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={mappedName}>
                            {mappedName}
                          </div>
                          <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-soft)' }}>
                            {c.inferred_type} · {c.null_count} nulls
                          </div>
                        </div>
                        <input
                          type="text"
                          aria-label={`Rename ${mappedName}`}
                          value={renamed}
                          disabled={isDropped}
                          placeholder="Rename…"
                          onChange={(e) =>
                            onUpdateNode(node.id, {
                              params: {
                                ...p,
                                rename_columns: { ...(p.rename_columns || {}), [mappedName]: e.target.value },
                              },
                            })
                          }
                          className="mono"
                          style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 11.5 }}
                        />
                        <button
                          type="button"
                          className="btn"
                          aria-label={isDropped ? `Show ${mappedName}` : `Hide ${mappedName}`}
                          onClick={() => {
                            const cur = p.drop_columns || [];
                            const next = isDropped ? cur.filter((x) => x !== mappedName) : [...cur, mappedName];
                            onUpdateNode(node.id, { params: { ...p, drop_columns: next } });
                          }}
                          style={{ minHeight: 28, padding: 0 }}
                        >
                          {isDropped ? <Eye size={13} aria-hidden="true" /> : <EyeOff size={13} aria-hidden="true" />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. CLEAN & DEDUPE */}
        {node.type === 'clean_sales' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600 }}>
              <input type="checkbox" checked={node.enabled !== false} onChange={(e) => onUpdateNode(node.id, { enabled: e.target.checked })} />
              Enable cleaning step
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={p.deduplicate !== false} onChange={(e) => onUpdateNode(node.id, { params: { ...p, deduplicate: e.target.checked } })} />
                Deduplicate rows by column:
              </label>
              {p.deduplicate !== false && (
                <select
                  aria-label="Deduplicate key column"
                  value={p.dedupe_column || (availCols.includes('transaction_id') ? 'transaction_id' : availCols[0] || '')}
                  onChange={(e) => onUpdateNode(node.id, { params: { ...p, dedupe_column: e.target.value } })}
                  style={{ padding: '5px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12 }}
                >
                  {availCols.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={p.drop_returns !== false} onChange={(e) => onUpdateNode(node.id, { params: { ...p, drop_returns: e.target.checked } })} />
              Exclude returns / quantity &le; 0
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={p.trim_text !== false} onChange={(e) => onUpdateNode(node.id, { params: { ...p, trim_text: e.target.checked } })} />
              Trim spaces &amp; normalize text casing
            </label>

            <div style={{ paddingTop: 6, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-soft)' }}>FILL MISSING VALUES (OPTIONAL)</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 6 }}>
                <select
                  aria-label="Fill nulls column"
                  value={p.fill_null_column || ''}
                  onChange={(e) => onUpdateNode(node.id, { params: { ...p, fill_null_column: e.target.value } })}
                  style={{ padding: '5px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12 }}
                >
                  <option value="">None</option>
                  {availCols.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <input
                  type="text"
                  aria-label="Fill null value"
                  value={p.fill_null_value ?? ''}
                  placeholder="Value…"
                  onChange={(e) => onUpdateNode(node.id, { params: { ...p, fill_null_value: e.target.value } })}
                  className="mono"
                  style={{ padding: '5px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12 }}
                />
              </div>
            </div>
          </div>
        )}

        {/* 3. MULTI-CONDITION FILTER ROWS */}
        {node.type === 'filter_rows' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {['all', 'any'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="btn"
                    onClick={() => onUpdateNode(node.id, { params: { ...p, match: m, conditions: filterConditions } })}
                    style={{
                      minHeight: 26,
                      padding: '2px 8px',
                      fontSize: 11.5,
                      background: (p.match || 'all') === m ? 'var(--primary-soft)' : 'var(--surface)',
                      color: (p.match || 'all') === m ? 'var(--primary)' : 'var(--text-muted)',
                      borderColor: (p.match || 'all') === m ? 'var(--primary)' : 'var(--border)',
                    }}
                  >
                    Match {m.toUpperCase()}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  onUpdateNode(node.id, {
                    params: {
                      ...p,
                      conditions: [...filterConditions, { column: availCols[0] || '', op: '=', value: '' }],
                    },
                  })
                }
                style={{ border: 'none', background: 'none', color: 'var(--primary)', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}
              >
                <Plus size={12} aria-hidden="true" /> Condition
              </button>
            </div>

            {filterConditions.map((cond, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                <select
                  aria-label={`Filter column ${idx + 1}`}
                  value={cond.column}
                  onChange={(e) =>
                    onUpdateNode(node.id, {
                      params: {
                        ...p,
                        conditions: filterConditions.map((c, i) => (i === idx ? { ...c, column: e.target.value } : c)),
                      },
                    })
                  }
                  style={{ width: 112, padding: '5px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12 }}
                >
                  {availCols.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <select
                  aria-label={`Filter op ${idx + 1}`}
                  value={cond.op}
                  onChange={(e) =>
                    onUpdateNode(node.id, {
                      params: {
                        ...p,
                        conditions: filterConditions.map((c, i) => (i === idx ? { ...c, op: e.target.value } : c)),
                      },
                    })
                  }
                  style={{ width: 76, padding: '5px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12 }}
                >
                  {['=', '!=', '>', '>=', '<', '<=', 'contains', 'is_null', 'not_null'].map((op) => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </select>
                {cond.op !== 'is_null' && cond.op !== 'not_null' && (
                  <input
                    type="text"
                    aria-label={`Filter value ${idx + 1}`}
                    value={cond.value ?? ''}
                    onChange={(e) =>
                      onUpdateNode(node.id, {
                        params: {
                          ...p,
                          conditions: filterConditions.map((c, i) => (i === idx ? { ...c, value: e.target.value } : c)),
                        },
                      })
                    }
                    placeholder="Value"
                    className="mono"
                    style={{ flex: 1, minWidth: 50, padding: '5px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12 }}
                  />
                )}
                {filterConditions.length > 1 && (
                  <button
                    type="button"
                    aria-label="Remove condition"
                    onClick={() =>
                      onUpdateNode(node.id, {
                        params: { ...p, conditions: filterConditions.filter((_, i) => i !== idx) },
                      })
                    }
                    style={{ border: 'none', background: 'none', color: 'var(--text-soft)', cursor: 'pointer' }}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 4. MULTI-FORMULA COLUMN WITH CLICKABLE CHIPS & PRESETS */}
        {node.type === 'formula' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-soft)' }}>FORMULAS</span>
              <button
                type="button"
                onClick={() =>
                  onUpdateNode(node.id, {
                    params: { ...p, formulas: [...formulaItems, { column_name: `calc_${formulaItems.length + 1}`, expression: '' }] },
                  })
                }
                style={{ border: 'none', background: 'none', color: 'var(--primary)', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}
              >
                <Plus size={12} aria-hidden="true" /> Formula
              </button>
            </div>

            {formulaItems.map((item, idx) => (
              <div key={idx} style={{ padding: 8, borderRadius: 6, background: 'var(--surface-muted)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="text"
                    aria-label={`Formula column name ${idx + 1}`}
                    value={item.column_name}
                    onFocus={() => setFocusedFormulaIdx(idx)}
                    onChange={(e) =>
                      onUpdateNode(node.id, {
                        params: {
                          ...p,
                          formulas: formulaItems.map((f, i) => (i === idx ? { ...f, column_name: e.target.value } : f)),
                        },
                      })
                    }
                    placeholder="column_name"
                    className="mono"
                    style={{ flex: 1, padding: '5px 7px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12 }}
                  />
                  {formulaItems.length > 1 && (
                    <button
                      type="button"
                      aria-label="Remove formula"
                      onClick={() =>
                        onUpdateNode(node.id, {
                          params: { ...p, formulas: formulaItems.filter((_, i) => i !== idx) },
                        })
                      }
                      style={{ border: 'none', background: 'none', color: 'var(--text-soft)', cursor: 'pointer' }}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  aria-label={`Formula expression ${idx + 1}`}
                  value={item.expression}
                  onFocus={() => setFocusedFormulaIdx(idx)}
                  onChange={(e) =>
                    onUpdateNode(node.id, {
                      params: {
                        ...p,
                        formulas: formulaItems.map((f, i) => (i === idx ? { ...f, expression: e.target.value } : f)),
                      },
                    })
                  }
                  placeholder="e.g. quantity * unit_price"
                  className="mono"
                  style={{ width: '100%', padding: '5px 7px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12 }}
                />
              </div>
            ))}

            <div>
              <div style={{ fontSize: 11, color: 'var(--text-soft)', marginBottom: 4 }}>Click column to insert:</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {availCols.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() =>
                      onUpdateNode(node.id, {
                        params: {
                          ...p,
                          formulas: formulaItems.map((f, i) =>
                            i === focusedFormulaIdx ? { ...f, expression: `${f.expression ? `${f.expression} ` : ''}${c}` } : f
                          ),
                        },
                      })
                    }
                    className="mono"
                    style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    + {c}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: 'var(--text-soft)', marginBottom: 4 }}>Retail presets:</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {FORMULA_PRESETS.map((pre) => (
                  <button
                    key={pre.name}
                    type="button"
                    className="btn"
                    onClick={() =>
                      onUpdateNode(node.id, {
                        params: { ...p, formulas: [...formulaItems.filter((f) => f.expression), { column_name: pre.name, expression: pre.expr }] },
                      })
                    }
                    style={{ minHeight: 26, padding: '2px 8px', fontSize: 11 }}
                  >
                    {pre.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 5. MULTI-GROUP & MULTI-AGG SUMMARIZE */}
        {node.type === 'summarize' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }}>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-soft)', marginBottom: 5 }}>GROUP BY COLUMNS</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {availCols.map((c) => {
                  const active = groupByCols.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      className="btn"
                      onClick={() => {
                        const next = active ? groupByCols.filter((x) => x !== c) : [...groupByCols, c];
                        onUpdateNode(node.id, { params: { ...p, group_by: next } });
                      }}
                      style={{
                        minHeight: 26,
                        padding: '2px 8px',
                        fontSize: 11.5,
                        background: active ? 'var(--primary-soft)' : 'var(--surface)',
                        color: active ? 'var(--primary)' : 'var(--text-muted)',
                        borderColor: active ? 'var(--primary)' : 'var(--border)',
                      }}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-soft)' }}>METRICS</span>
              <button
                type="button"
                onClick={() =>
                  onUpdateNode(node.id, {
                    params: { ...p, aggregations: [...aggItems, { column: availCols[0] || '*', func: 'SUM', alias: '' }] },
                  })
                }
                style={{ border: 'none', background: 'none', color: 'var(--primary)', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}
              >
                <Plus size={12} aria-hidden="true" /> Metric
              </button>
            </div>

            {aggItems.map((agg, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                <select
                  aria-label={`Agg function ${idx + 1}`}
                  value={agg.func}
                  onChange={(e) =>
                    onUpdateNode(node.id, {
                      params: { ...p, aggregations: aggItems.map((a, i) => (i === idx ? { ...a, func: e.target.value } : a)) },
                    })
                  }
                  style={{ width: 105, padding: '5px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12 }}
                >
                  {['SUM', 'AVG', 'COUNT', 'COUNT_DISTINCT', 'PCT_TOTAL', 'MIN', 'MAX'].map((fn) => (
                    <option key={fn} value={fn}>{fn}</option>
                  ))}
                </select>
                <select
                  aria-label={`Agg column ${idx + 1}`}
                  value={agg.column}
                  onChange={(e) =>
                    onUpdateNode(node.id, {
                      params: { ...p, aggregations: aggItems.map((a, i) => (i === idx ? { ...a, column: e.target.value } : a)) },
                    })
                  }
                  style={{ flex: 1, padding: '5px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12 }}
                >
                  <option value="*">* (Rows)</option>
                  {availCols.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                {aggItems.length > 1 && (
                  <button
                    type="button"
                    aria-label="Remove metric"
                    onClick={() =>
                      onUpdateNode(node.id, {
                        params: { ...p, aggregations: aggItems.filter((_, i) => i !== idx) },
                      })
                    }
                    style={{ border: 'none', background: 'none', color: 'var(--text-soft)', cursor: 'pointer' }}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 6. MERGE TABLES WITH CONFIGURABLE KEYS */}
        {node.type === 'merge_sku' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ color: 'var(--text-soft)', fontSize: 11.5 }}>Left Join Key</span>
                <select
                  value={p.left_key || 'product_id'}
                  onChange={(e) => onUpdateNode(node.id, { params: { ...p, left_key: e.target.value } })}
                  style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                >
                  {(leftColumns?.length ? leftColumns : ['product_id']).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ color: 'var(--text-soft)', fontSize: 11.5 }}>Right Join Key</span>
                <select
                  value={p.right_key || 'product_id'}
                  onChange={(e) => onUpdateNode(node.id, { params: { ...p, right_key: e.target.value } })}
                  style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                >
                  {(rightColumns?.length ? rightColumns : ['product_id']).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              {['left', 'inner', 'full'].map((how) => (
                <button
                  key={how}
                  type="button"
                  className="btn"
                  onClick={() => onUpdateNode(node.id, { params: { ...p, how } })}
                  style={{
                    flex: 1,
                    minHeight: 30,
                    fontSize: 12,
                    background: (p.how || 'left') === how ? 'var(--primary-soft)' : 'var(--surface)',
                    color: (p.how || 'left') === how ? 'var(--primary)' : 'var(--text-muted)',
                    borderColor: (p.how || 'left') === how ? 'var(--primary)' : 'var(--border)',
                  }}
                >
                  {how.toUpperCase()}
                </button>
              ))}
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={p.aggregate_sales !== false}
                onChange={(e) => onUpdateNode(node.id, { params: { ...p, aggregate_sales: e.target.checked } })}
              />
              Roll up sales velocity per SKU when merging stock
            </label>
          </div>
        )}

        {/* 7. REORDER RULES */}
        {node.type === 'reorder_rules' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12.5 }}>
            {[
              { key: 'critical_days', label: 'Critical (< days)', def: 7 },
              { key: 'low_days', label: 'Low (< days)', def: 14 },
              { key: 'dead_days', label: 'Dead Stock (> days)', def: 90 },
              { key: 'target_cover_days', label: 'Target Cover (days)', def: 30 },
              { key: 'default_lead_time_days', label: 'Default Lead Time', def: 7 },
            ].map((field) => (
              <label key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ color: 'var(--text-soft)', fontSize: 11.5 }}>{field.label}</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={p[field.key] ?? field.def}
                  onChange={(e) =>
                    onUpdateNode(node.id, {
                      params: { ...p, [field.key]: Math.max(1, Number(e.target.value) || field.def) },
                    })
                  }
                  className="mono"
                  style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}
                />
              </label>
            ))}
          </div>
        )}

        {/* 8. ACTION OUTPUT */}
        {node.type === 'action_output' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {summaryMetrics?.total_skus > 0 && cols.includes('suggested_reorder_qty') && (
              <div style={{ padding: 12, borderRadius: 6, background: 'var(--surface-muted)', border: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-soft)' }}>Critical / Low</div>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--danger)' }}>
                    {summaryMetrics.critical_count} / {summaryMetrics.low_count}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-soft)' }}>PO Units Needed</div>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--primary)' }}>
                    +{summaryMetrics.total_reorder_units.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-soft)' }}>Est. PO Cost</div>
                  <div className="mono" style={{ fontSize: 15, fontWeight: 700 }}>
                    ${summaryMetrics.estimated_po_cost.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-soft)' }}>Dead Stock Cash</div>
                  <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: 'var(--warning)' }}>
                    ${summaryMetrics.dead_stock_value.toLocaleString()}
                  </div>
                </div>
              </div>
            )}

            {cols.includes('status') && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['ALL', 'Critical', 'Low', 'Dead Stock'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    className="btn"
                    onClick={() => onUpdateNode(node.id, { params: { ...p, filter_status: st } })}
                    style={{
                      minHeight: 30,
                      padding: '4px 10px',
                      fontSize: 12,
                      background: (p.filter_status || 'ALL') === st ? 'var(--primary-soft)' : 'var(--surface)',
                      color: (p.filter_status || 'ALL') === st ? 'var(--primary)' : 'var(--text-muted)',
                      borderColor: (p.filter_status || 'ALL') === st ? 'var(--primary)' : 'var(--border)',
                    }}
                  >
                    {st === 'ALL' ? 'All SKUs' : st}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                className="btn btn-cta"
                onClick={() =>
                  onExport(cols.includes('status') ? 'reorder' : 'all', cols.includes('status') ? 'reorder_purchase_order.csv' : 'flow_output.csv', node.id)
                }
              >
                <Download size={14} aria-hidden="true" /> {cols.includes('status') ? 'Export Reorder PO CSV' : 'Export Output CSV'}
              </button>
              {cols.includes('status') && (
                <button type="button" className="btn" onClick={() => onExport('dead_stock', 'dead_stock_clearance.csv', node.id)}>
                  <Download size={14} aria-hidden="true" /> Export Dead Stock CSV
                </button>
              )}
              <button type="button" className="btn" onClick={() => window.print()}>
                <Printer size={14} aria-hidden="true" /> Print Briefing
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Right Column: Interactive Sortable Step Data Table */}
      <section className="panel" style={{ overflow: 'hidden', minWidth: 0 }}>
        <div
          style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>
            Step Output: {node.label}{' '}
            <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-soft)', fontWeight: 400 }}>
              ({nodeResult?.row_count ?? 0} rows · {cols.length} cols)
            </span>
          </div>

          <div className="no-print" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} aria-hidden="true" style={{ position: 'absolute', left: 9, top: 10, color: 'var(--text-soft)' }} />
              <input
                type="text"
                aria-label="Filter step output rows"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter rows…"
                style={{ minHeight: 32, padding: '4px 10px 4px 28px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5, width: 175 }}
              />
            </div>
            {cols.length > 0 && (
              <button
                type="button"
                className="btn"
                onClick={() => onExport('all', `${node.id}_step.csv`, node.id)}
                style={{ minHeight: 32, padding: '4px 10px', fontSize: 12 }}
              >
                <Download size={13} aria-hidden="true" /> CSV
              </button>
            )}
          </div>
        </div>

        <div className="table-wrap" style={{ maxHeight: 460 }}>
          <table className="data-table">
            <thead>
              <tr>
                {cols.map((c) => {
                  const st = statMap[c];
                  return (
                    <th key={c}>
                      <button
                        type="button"
                        onClick={() => toggleSort(c)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: sortCol === c ? 'var(--primary)' : 'inherit',
                          font: 'inherit',
                          textTransform: 'inherit',
                          letterSpacing: 'inherit',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      >
                        <span>{c}</span>
                        {st && (
                          <span className="mono" style={{ fontSize: 9.5, opacity: 0.7, textTransform: 'lowercase' }}>
                            ({st.dtype})
                          </span>
                        )}
                        <ArrowUpDown size={11} aria-hidden="true" />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, idx) => (
                <tr key={idx}>
                  {cols.map((c) => {
                    const val = row[c];
                    if (c === 'status' && STATUS_TAG[val]) {
                      return (
                        <td key={c}>
                          <span className={`tag ${STATUS_TAG[val]}`}>{val}</span>
                        </td>
                      );
                    }
                    if (c === 'suggested_reorder_qty' && typeof val === 'number' && val > 0) {
                      return (
                        <td key={c} className="mono" style={{ fontWeight: 700, color: 'var(--primary)' }}>
                          +{val}
                        </td>
                      );
                    }
                    if (c === 'days_of_cover') {
                      return (
                        <td key={c} className="mono">
                          {val !== null && val !== undefined ? `${val}d` : '∞'}
                        </td>
                      );
                    }
                    return (
                      <td key={c} className={typeof val === 'number' ? 'mono' : undefined} style={{ whiteSpace: 'nowrap' }}>
                        {fmtVal(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {sortedRows.length === 0 && (
                <tr>
                  <td colSpan={Math.max(1, cols.length)} style={{ textAlign: 'center', color: 'var(--text-soft)', padding: 24 }}>
                    {nodeResult?.error_message || 'No rows to preview for this step.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
