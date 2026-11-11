import { useMemo } from 'react';
import { pricingPlan } from '../engine/sell';
import type { Settings } from '../engine/settings';
import type { CompsContext } from '../engine/value';
import { aud } from '../format';
import type { SellDraft } from '../store';
import { draftToResult, INDUSTRY_PRESETS } from './sellForm';

const fmtAest = (iso: string) =>
  new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

export function SellSaved({ drafts, settings, comps, onOpen, onNew, onDuplicate, onDelete }: {
  drafts: SellDraft[];
  settings: Settings;
  comps: CompsContext;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const rows = useMemo(() => drafts
    .map((d) => {
      const res = draftToResult(d, settings, comps);
      const plan = res.record ? pricingPlan(res.record, settings, comps) : undefined;
      const ind = INDUSTRY_PRESETS.find(([c]) => c && c === d.values.industry_preset)?.[1] ?? d.values.industry_code ?? '';
      return { d, plan, ind };
    })
    .sort((a, b) => b.d.updatedAt.localeCompare(a.d.updatedAt)), [drafts, settings, comps]);

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <h1>Saved valuations</h1>
          <p className="ink2" style={{ margin: '6px 0 0' }}>Your pricing scenarios, kept in this browser and separate from the buy-side portfolio. Prices recalculate with current settings.</p>
        </div>
        <button className="btn primary" onClick={onNew}>Price a business</button>
      </div>
      {!rows.length ? (
        <div className="panel empty">
          <h2>No saved valuations yet</h2>
          <p>Answer a few questions about your business to get a fair value and a recommended list price.</p>
          <button className="btn primary" onClick={onNew}>Price my business</button>
        </div>
      ) : (
        <div className="panel tablewrap">
          <table className="data">
            <thead><tr><th>Business</th><th>Industry</th><th>Updated (AEST)</th><th className="num">Fair value (AUD)</th><th className="num">Recommended list (AUD)</th><th /></tr></thead>
            <tbody>
              {rows.map(({ d, plan, ind }) => {
                const rec = plan?.strategies.find((s) => s.id === plan.recommended);
                return (
                  <tr key={d.id} onClick={() => onOpen(d.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(d.id)}>
                    <td className="name">{d.name}</td>
                    <td className="ink2">{ind}</td>
                    <td className="ink2">{fmtAest(d.updatedAt)}</td>
                    <td className="num">{plan ? aud(plan.fv.fvPoint) : <span className="muted">incomplete</span>}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{rec ? aud(rec.listPrice) : '—'}</td>
                    <td className="num" onClick={(e) => e.stopPropagation()}>
                      <button className="btn sm ghost" onClick={() => onDuplicate(d.id)}>Duplicate</button>
                      <button className="btn sm ghost danger" onClick={() => { if (window.confirm(`Delete "${d.name}"?`)) onDelete(d.id); }}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
