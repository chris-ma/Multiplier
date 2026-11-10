import { useMemo, useRef, useState } from 'react';
import { FIELDS, FIELD_MAP } from '../engine/fields';
import type { Settings } from '../engine/settings';
import type { BizRecord } from '../engine/types';
import type { CompsContext } from '../engine/value';
import { aud, ratio } from '../format';
import { parseJsonFile } from '../import/json';
import { csvTemplate, download, jsonTemplate } from '../import/templates';
import { autoMap, errorsCsv, MAX_BYTES, MAX_ROWS, parseCsvText, validateRows, type Mapping } from '../import/validate';
import { lsGet, lsSet } from '../store';
import { VerdictTag } from './common';

type Step = 'file' | 'map' | 'preview' | 'done';
const LS_TEMPLATES = 'multiplier:mapping-templates';

export function ImportView({ settings, comps, onCommit }: {
  settings: Settings;
  comps: CompsContext;
  onCommit: (records: BizRecord[]) => Promise<{ added: number; updated: number }>;
}) {
  const [step, setStep] = useState<Step>('file');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [over, setOver] = useState(false);
  const [templates, setTemplates] = useState<Record<string, Mapping>>(() => lsGet(LS_TEMPLATES, {}));
  const [result, setResult] = useState<{ added: number; updated: number; rejected: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validated = useMemo(() => (step === 'preview' ? validateRows(rows, mapping, settings, comps) : []), [step, rows, mapping, settings, comps]);
  const counts = { valid: 0, warning: 0, rejected: 0 };
  validated.forEach((r) => counts[r.status]++);

  const handleFile = async (f: File) => {
    setError('');
    if (f.size > MAX_BYTES) { setError(`File is ${(f.size / 1e6).toFixed(1)} MB; the limit is 10 MB.`); return; }
    const text = await f.text();
    const isJson = f.name.toLowerCase().endsWith('.json') || text.trim().startsWith('{') || text.trim().startsWith('[');
    let hs: string[];
    let rs: Record<string, unknown>[];
    if (isJson) {
      const p = parseJsonFile(text);
      if (p.error) { setError(p.error); return; }
      rs = p.rows;
      hs = Array.from(new Set(rs.flatMap((r) => Object.keys(r))));
    } else {
      const p = parseCsvText(text);
      if (p.error) { setError(p.error); return; }
      rs = p.rows; hs = p.headers;
    }
    if (!rs.length) { setError('No rows found.'); return; }
    if (rs.length > MAX_ROWS) setError(`File has ${rs.length} rows; only the first ${MAX_ROWS} will be processed.`);
    setFileName(f.name);
    setHeaders(hs);
    setRows(rs);
    const auto = autoMap(hs);
    setMapping(auto);
    setStep(hs.every((h) => auto[h]) ? 'preview' : 'map');
  };

  const commit = async () => {
    const ok = validated.filter((r) => r.status !== 'rejected' && r.record).map((r) => r.record!);
    const res = await onCommit(ok);
    setResult({ ...res, rejected: counts.rejected });
    setStep('done');
  };

  const reset = () => { setStep('file'); setRows([]); setHeaders([]); setResult(null); setError(''); };
  const mappedKeys = Object.values(mapping).filter(Boolean);
  const missingRequired = FIELDS.filter((f) => f.required === true && !mappedKeys.includes(f.key));

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <h1>Import</h1>
          <p className="ink2" style={{ margin: '6px 0 0' }}>CSV (UTF-8) or JSON, up to 5,000 rows or 10 MB. Records upsert on <span className="mono">record_id</span>; nothing is written until you approve the preview.</p>
        </div>
        <div className="row">
          <button className="btn sm" onClick={() => download('multiplier-template.csv', csvTemplate())}>CSV template</button>
          <button className="btn sm" onClick={() => download('multiplier-template.json', jsonTemplate(), 'application/json')}>JSON template</button>
        </div>
      </div>

      <div className="steps" aria-label="Import steps">
        {(['file', 'map', 'preview', 'done'] as Step[]).map((s, i) => (
          <span key={s} className={step === s ? 'on' : ''}>{i + 1}. {s === 'file' ? 'Select file' : s === 'map' ? 'Map columns' : s === 'preview' ? 'Validate & preview' : 'Committed'}</span>
        ))}
      </div>
      {error && <div className="flag bad">{error}</div>}

      {step === 'file' && (
        <div
          className={`dropzone${over ? ' over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => inputRef.current?.click()}
          role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        >
          <div style={{ fontWeight: 600 }}>Drop a .csv or .json file, or click to choose</div>
          <div className="small muted" style={{ marginTop: 6 }}>Numbers accept $, commas and k/m suffixes. Dates accept YYYY-MM-DD or DD/MM/YYYY.</div>
          <input ref={inputRef} type="file" accept=".csv,.json,text/csv,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
        </div>
      )}

      {step === 'map' && (
        <div className="panel">
          <div className="panel-h">
            <h2>Map columns · <span className="mono">{fileName}</span></h2>
            <div className="row">
              {Object.keys(templates).length > 0 && (
                <select value="" onChange={(e) => { const t = templates[e.target.value]; if (t) setMapping(Object.fromEntries(headers.map((h) => [h, t[h] ?? mapping[h] ?? '']))); }} aria-label="Apply mapping template">
                  <option value="">Apply template…</option>
                  {Object.keys(templates).map((n) => <option key={n}>{n}</option>)}
                </select>
              )}
              <button className="btn sm" onClick={() => {
                const name = window.prompt('Template name (e.g. a broker export)');
                if (!name) return;
                const next = { ...templates, [name]: mapping };
                setTemplates(next); lsSet(LS_TEMPLATES, next);
              }}>Save as template</button>
            </div>
          </div>
          <div className="tablewrap">
            <table className="data">
              <thead><tr><th>File column</th><th>Sample</th><th>Schema field</th></tr></thead>
              <tbody>
                {headers.map((h) => (
                  <tr key={h} className="static">
                    <td className="mono">{h}</td>
                    <td className="ink2" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(rows[0]?.[h] ?? '')}</td>
                    <td>
                      <select value={mapping[h] ?? ''} onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })} aria-label={`Map ${h}`}>
                        <option value="">— ignore —</option>
                        {FIELDS.map((f) => <option key={f.key} value={f.key}>{f.key}{f.required === true ? ' *' : ''}</option>)}
                      </select>
                      {mapping[h] && FIELD_MAP[mapping[h]] && mapping[h] !== h && <span className="small muted"> {FIELD_MAP[mapping[h]].label}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel-b spread">
            <span className="small">{missingRequired.length ? <span className="status-rejected">Unmapped required: {missingRequired.map((f) => f.key).join(', ')}</span> : <span className="ink2">All required fields mapped.</span>}</span>
            <div className="row"><button className="btn" onClick={reset}>Cancel</button><button className="btn primary" onClick={() => setStep('preview')}>Validate</button></div>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="panel">
          <div className="panel-h">
            <h2>Preview · <span className="mono">{fileName}</span></h2>
            <span className="small">
              <span className="status-valid">{counts.valid} valid</span> · <span className="status-warning">{counts.warning} with warnings</span> · <span className="status-rejected">{counts.rejected} rejected</span>
            </span>
          </div>
          <div className="tablewrap">
            <table className="data">
              <thead><tr><th>Row</th><th>Status</th><th>ID</th><th>Business</th><th className="num">Price (AUD)</th><th className="num">FV (AUD)</th><th className="num">P/FV</th><th>Verdict</th><th>Issues</th></tr></thead>
              <tbody>
                {validated.slice(0, 50).map((r) => (
                  <tr key={r.index} className="static">
                    <td className="mono">{r.index + 2}</td>
                    <td className={`status-${r.status}`}>{r.status === 'warning' ? 'valid with warnings' : r.status}</td>
                    <td className="mono">{String(r.record?.record_id ?? r.raw.record_id ?? '')}</td>
                    <td>{String(r.record?.business_name ?? r.raw.business_name ?? '')}</td>
                    <td className="num">{aud(r.valuation?.price)}</td>
                    <td className="num">{aud(r.valuation?.fvPoint)}</td>
                    <td className="num">{ratio(r.valuation?.pfv)}</td>
                    <td>{r.valuation ? <VerdictTag v={r.valuation} short /> : '—'}</td>
                    <td className="small" style={{ minWidth: 260 }}>
                      {r.issues.map((i, k) => (
                        <div key={k} className={i.severity === 'reject' ? 'status-rejected' : 'status-warning'}>
                          <span className="mono">{i.field}</span>: {i.message}{i.suggestion ? ` → did you mean "${i.suggestion}"?` : ''}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel-b spread">
            <span className="small muted">Showing the first {Math.min(50, validated.length)} of {validated.length} rows.</span>
            <div className="row">
              <button className="btn" onClick={() => setStep(headers.length ? 'map' : 'file')}>Back to mapping</button>
              <button className="btn" disabled={!counts.rejected} onClick={() => download(`${fileName.replace(/\.\w+$/, '')}-errors.csv`, errorsCsv(validated))}>Download {counts.rejected} rejected rows</button>
              <button className="btn primary" disabled={!counts.valid && !counts.warning} onClick={commit}>Commit {counts.valid + counts.warning} records</button>
            </div>
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="panel panel-b stack">
          <h2>Import committed</h2>
          <p className="ink2" style={{ margin: 0 }}>{result.added} added · {result.updated} updated · {result.rejected} rejected (not written).</p>
          <div className="row">
            {result.rejected > 0 && <button className="btn" onClick={() => download(`${fileName.replace(/\.\w+$/, '')}-errors.csv`, errorsCsv(validated))}>Download rejected rows</button>}
            <button className="btn primary" onClick={reset}>Import another file</button>
          </div>
        </div>
      )}
    </div>
  );
}
