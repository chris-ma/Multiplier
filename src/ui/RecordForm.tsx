import { useMemo, useState } from 'react';
import { FIELDS, GROUPS, type FieldDef } from '../engine/fields';
import type { Settings } from '../engine/settings';
import type { BizRecord } from '../engine/types';
import type { CompsContext } from '../engine/value';
import { aud, mult, ratio } from '../format';
import { validateRow } from '../import/validate';
import { VerdictTag } from './common';
import { PfvStrip } from './PfvStrip';

const toStr = (v: unknown) => (v === undefined || v === null ? '' : String(v));

/** Single-record calculator. Uses the same coercion + Zod pipeline as bulk import. */
export function RecordForm({ initial, settings, comps, existingIds, onSave, onCancel }: {
  initial?: BizRecord;
  settings: Settings;
  comps: CompsContext;
  existingIds: string[];
  onSave: (r: BizRecord) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    if (initial) return Object.fromEntries(FIELDS.map((f) => [f.key, toStr((initial as unknown as Record<string, unknown>)[f.key])]));
    const n = existingIds.length + 1;
    return { record_id: `BX-${String(n).padStart(4, '0')}`, status: 'listed' };
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [tried, setTried] = useState(false);

  const res = useMemo(() => validateRow(draft, settings, comps), [draft, settings, comps]);
  const errs = Object.fromEntries(res.issues.map((i) => [i.field, i]));
  const dupe = !initial && existingIds.includes(draft.record_id ?? '');

  const set = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const save = () => {
    setTried(true);
    if (res.record && !dupe) onSave(res.record);
  };

  const input = (f: FieldDef) => {
    const val = draft[f.key] ?? '';
    const common = { id: `f-${f.key}`, value: val, onBlur: () => setTouched((t) => ({ ...t, [f.key]: true })) };
    if (f.type === 'enum') {
      return (
        <select {...common} onChange={(e) => set(f.key, e.target.value)}>
          <option value="">—</option>
          {f.options!.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (f.type === 'boolean') {
      return (
        <select {...common} onChange={(e) => set(f.key, e.target.value)}>
          <option value="">—</option><option value="true">Yes</option><option value="false">No</option>
        </select>
      );
    }
    if (f.type === 'date') return <input type="date" {...common} onChange={(e) => set(f.key, e.target.value)} />;
    const numeric = ['number', 'integer', 'percent', 'signed_percent', 'score05'].includes(f.type);
    return <input type="text" inputMode={numeric ? 'decimal' : undefined} {...common} onChange={(e) => set(f.key, e.target.value)} style={numeric ? { textAlign: 'right' } : undefined} />;
  };

  const v = res.valuation;
  return (
    <div className="stack">
      <div className="spread">
        <div>
          <h1>{initial ? `Edit ${initial.business_name}` : 'New record'}</h1>
          <p className="ink2" style={{ margin: '6px 0 0' }}>Nine fields produce a valuation; the rest tighten the confidence band. Same validation as bulk import.</p>
        </div>
        <div className="row"><button className="btn" onClick={onCancel}>Cancel</button><button className="btn primary" onClick={save}>Save record</button></div>
      </div>

      <div className="panel">
        <div className="panel-b">
          {v ? (
            <div className="stack">
              <div className="spread">
                <span><b>Live result:</b> FV {aud(v.fvPoint)} ({aud(v.fvLow)}–{aud(v.fvHigh)}) · {mult(v.adjustedMultiple)} · P/FV {ratio(v.pfv)}</span>
                <VerdictTag v={v} />
              </div>
              <PfvStrip v={v} />
            </div>
          ) : (
            <span className="ink2">Live result appears once the required fields are valid{res.issues.length ? ` (${res.issues.filter((i) => i.severity === 'reject').length} issues)` : ''}.</span>
          )}
          {dupe && <div className="field-err" style={{ marginTop: 8 }}>record_id {draft.record_id} already exists: saving would overwrite it. Edit that record instead, or change the ID.</div>}
        </div>
      </div>

      <div className="panel panel-b">
        {GROUPS.map((g, gi) => {
          const fs = FIELDS.filter((f) => f.group === g.id);
          return (
            <details key={g.id} className="group" open={gi < 2 || fs.some((f) => f.required)}>
              <summary><span>{g.label}</span><span className="small muted">{g.note}</span></summary>
              <div className="formgrid">
                {fs.map((f) => {
                  const e = errs[f.key];
                  const show = e && (touched[f.key] || tried || (draft[f.key] ?? '') !== '');
                  return (
                    <label key={f.key} className="field" htmlFor={`f-${f.key}`}>
                      <span>{f.label}{f.required === true ? ' *' : f.required ? ` (req. if ${f.required})` : ''}{f.unit ? <span className="muted"> · {f.unit}</span> : null}</span>
                      {input(f)}
                      {show ? <span className={e.severity === 'reject' ? 'field-err' : 'status-warning small'}>{e.message}{e.suggestion ? ` → "${e.suggestion}"?` : ''}</span>
                        : f.notes ? <span className="muted">{f.notes}</span> : null}
                    </label>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
