import { useMemo, useState } from 'react';
import type { FactorId } from '../engine/factors';
import { FIELDS, GROUPS } from '../engine/fields';
import type { Settings } from '../engine/settings';
import type { BizRecord } from '../engine/types';
import { VERDICTS, value, type CompsContext, type ValuationResult } from '../engine/value';
import { aud, mult, nowAest, pct, ratio, turns } from '../format';
import { Explain, Flags, VerdictTag } from './common';
import { PfvStrip } from './PfvStrip';

export function Detail({ record, settings, comps, onBack, onEdit, onDelete }: {
  record: BizRecord;
  settings: Settings;
  comps: CompsContext;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [overrides, setOverrides] = useState<Partial<Record<FactorId, number>>>({});
  const v = useMemo(() => value(record, settings, { comps, scoreOverrides: overrides }), [record, settings, comps, overrides]);
  const dataV = useMemo(() => value(record, settings, { comps }), [record, settings, comps]);
  const hasOverrides = Object.keys(overrides).length > 0;
  const verdictInfo = VERDICTS.find((x) => x.id === v.verdict);

  return (
    <div className="stack">
      <div className="print-only small">Multiplier valuation summary · generated {nowAest()} AEST · screening estimate, not a formal valuation or financial advice</div>
      <div className="spread">
        <div>
          <button className="btn ghost sm no-print" onClick={onBack} style={{ marginLeft: -8 }}>← Portfolio</button>
          <h1 style={{ marginTop: 4 }}>{record.business_name}</h1>
          <div className="row small ink2" style={{ marginTop: 4 }}>
            <span className="mono">{record.record_id}</span>
            <span>· {v.sector.label}</span>
            <span>· <span className="mono">{record.industry_code}</span></span>
            <span>· {record.state}{record.postcode ? ` ${record.postcode}` : ''}</span>
            <span>· {record.status.replace('_', ' ')}</span>
            {record.source_url && <a href={record.source_url} target="_blank" rel="noreferrer">listing ↗</a>}
          </div>
        </div>
        <div className="row no-print">
          <button className="btn sm" onClick={() => window.print()}>PDF summary</button>
          <button className="btn sm" onClick={onEdit}>Edit record</button>
          <button className="btn sm danger" onClick={() => { if (window.confirm(`Delete ${record.record_id}?`)) onDelete(); }}>Delete</button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-b stack">
          <div className="spread">
            <div>
              <h3>{v.priceKind === 'sale' ? 'Sale price' : 'Asking price'} vs fair value</h3>
              <div className="hero-num" style={{ marginTop: 6 }}>
                {v.pfv !== undefined ? <>P/FV {ratio(v.pfv)}</> : 'No price to compare'}
              </div>
              <div style={{ marginTop: 6 }}><VerdictTag v={v} /></div>
              {verdictInfo && <div className="small ink2" style={{ marginTop: 4 }}>{v.priceKind === 'sale' ? 'Sold comparable: sale price against modelled fair value' : verdictInfo.reading}{v.confirmed ? '. Confirmed: price sits outside the confidence range.' : '. Not confirmed: price sits inside the confidence range.'}</div>}
            </div>
            {hasOverrides && (
              <div className="small ink2 no-print" style={{ textAlign: 'right' }}>
                What-if scores active (not saved)<br />
                Data-only: FV {aud(dataV.fvPoint)} · P/FV {ratio(dataV.pfv)}<br />
                <button className="btn sm" style={{ marginTop: 6 }} onClick={() => setOverrides({})}>Reset to data</button>
              </div>
            )}
          </div>
          <PfvStrip v={v} />
          <Outputs v={v} settings={settings} />
          <Flags v={v} />
        </div>
      </div>

      <div className="grid2">
        <div className="panel">
          <div className="panel-h"><h2>Multiple waterfall</h2><span className="small muted">Base → each factor → adjusted</span></div>
          <div className="panel-b"><Waterfall v={v} /></div>
        </div>
        <div className="panel">
          <div className="panel-h"><h2>Factor scores</h2><span className="small muted">Drag to test; FV updates live</span></div>
          <div className="panel-b">
            {v.factors.map((f) => (
              <div className="slider-row" key={f.id}>
                <span className="mono muted">{f.num}</span>
                <Explain tip={<>−2: {f.thresholds.m2}<br />0: {f.thresholds.z}<br />+2: {f.thresholds.p2}<br />Max swing ±{f.swing.toFixed(2)} turns; each point = {f.w.toFixed(3)} turns.</>}>
                  {f.name}
                </Explain>
                <input
                  type="range" min={-2} max={f.noUpside ? 0 : 2} step={1} value={f.score ?? 0}
                  aria-label={`${f.name} score`} style={{ opacity: f.score === null ? 0.4 : 1 }}
                  onChange={(e) => setOverrides((o) => ({ ...o, [f.id]: Number(e.target.value) }))}
                />
                <span className="num">{f.score === null ? 'n/a' : (f.score > 0 ? `+${f.score}` : f.score)}{f.overridden ? '*' : ''}</span>
                <span className="num">{turns(f.contribution)}</span>
                <span className="reason">{f.reason}</span>
              </div>
            ))}
            <div className="small muted" style={{ marginTop: 8 }}>n/a = no data, contributes 0. * = manual what-if score. Weights are the confirmed v1 defaults.</div>
          </div>
        </div>
      </div>

      <div className="grid2">
        <div className="panel">
          <div className="panel-h"><h2>Normalised SDE</h2><span className="small muted">{v.sde.ruleLabel}</span></div>
          <div className="panel-b tablewrap"><SdeTable v={v} /></div>
        </div>
        <div className="panel">
          <div className="panel-h"><h2>Inputs on file</h2><span className="small muted">{v.optionalPresent} optional fields · {v.bandReason}</span></div>
          <div className="panel-b"><Inputs record={record} /></div>
        </div>
      </div>
    </div>
  );
}

function Outputs({ v, settings }: { v: ValuationResult; settings: Settings }) {
  const W = v.sde.weighted;
  const fvTip = v.lossMaking
    ? <>Loss-making: asset-based value, zero goodwill.<br />Stock {aud(v.inventory)} + excess assets {aud(v.excessAssets)} + plant & equipment − deferred capex {aud(v.deferredCapex)}</>
    : <>FV = weighted SDE × adjusted multiple + stock + excess assets − deferred capex<br />= {aud(W)} × {mult(v.adjustedMultiple)} + {aud(v.inventory)} + {aud(v.excessAssets)} − {aud(v.deferredCapex)}<br />= {aud(v.fvPoint)}</>;
  const cells: [string, string, React.ReactNode][] = [
    ['Fair value (point)', aud(v.fvPoint), fvTip],
    ['Fair value range', `${aud(v.fvLow)} – ${aud(v.fvHigh)}`, <>Point ± {Math.round(v.bandPct * 100)}% ({v.bandReason}). ±10% needs all 9 required + 20 optional fields; ±15% partial; ±20% minimum; ±25% legal review.</>],
    [v.priceKind === 'sale' ? 'Sale price' : 'Asking price', aud(v.price), 'From the record'],
    ['Implied multiple', mult(v.impliedMultiple), <>Price ÷ weighted SDE = {aud(v.price)} ÷ {aud(W)}</>],
    ['Adjusted multiple', mult(v.adjustedMultiple), <>Base {mult(v.baseMultiple)} ({v.baseSource === 'comparables' ? `median of ${v.compsCount} sold comparables` : 'benchmark midpoint'}) {turns(v.factorTurns)} turns from factors{v.clampNote ? `, then ${v.clampNote.toLowerCase()}` : ''}</>],
    ['Weighted SDE', aud(W), <>{v.sde.ruleLabel}. Earnings basis: {v.earningsBasis}{v.earningsBasis === 'EBITDA' ? ' (absentee owner: business fully under management)' : ''}.</>],
    ['Expected sale price', aud(v.expectedSale), <>Asking × sale-to-asking ratio {settings.saleToAsking} (editable in Settings)</>],
    ['DSCR', ratio(v.dscr), v.annualDebtService !== undefined
      ? <>(SDE − market owner wage) ÷ annual debt service<br />= ({aud(W)} − {aud(settings.marketOwnerWage)}) ÷ {aud(v.annualDebtService)}<br />Debt = asking × (1 − {settings.buyerEquityPct}% equity − earn-out). Lenders want ≥ {settings.dscrMin}.</>
      : 'Only tested for listings with an asking price'],
  ];
  return (
    <div className="statgrid">
      {cells.map(([l, val, tip]) => (
        <div key={l}>
          <div className="lbl">{l}</div>
          <div style={{ fontWeight: 500 }}><Explain tip={tip}>{val}</Explain></div>
        </div>
      ))}
    </div>
  );
}

function Waterfall({ v }: { v: ValuationResult }) {
  let cum = v.baseMultiple;
  const rows: { label: string; from: number; to: number; kind: 'total' | 'pos' | 'neg' | 'clamp' | 'zero'; tip: string; val: string }[] = [
    { label: `Base (${v.baseSource === 'comparables' ? 'comps' : 'benchmark'})`, from: 0, to: v.baseMultiple, kind: 'total', tip: `${v.sector.label}: range ${mult(v.sector.min)}–${mult(v.sector.max)}`, val: mult(v.baseMultiple) },
  ];
  for (const f of v.factors) {
    const from = cum;
    cum += f.contribution;
    rows.push({ label: `${f.num}. ${f.name}`, from, to: cum, kind: f.contribution > 0 ? 'pos' : f.contribution < 0 ? 'neg' : 'zero', tip: `Score ${f.score ?? 'n/a'} × ${f.w.toFixed(3)} = ${turns(f.contribution)} turns. ${f.reason}`, val: turns(f.contribution) });
  }
  if (Math.abs(v.adjustedMultiple - cum) > 1e-9) {
    rows.push({ label: v.overrideNotes.some((n) => n.includes('capped')) ? 'Hard override' : 'Clamp', from: cum, to: v.adjustedMultiple, kind: 'clamp', tip: [v.clampNote, ...v.overrideNotes.filter((n) => n.includes('capped'))].filter(Boolean).join('. '), val: turns(v.adjustedMultiple - cum) });
  }
  rows.push({ label: 'Adjusted multiple', from: 0, to: v.adjustedMultiple, kind: 'total', tip: 'Applied to weighted SDE', val: mult(v.adjustedMultiple) });

  const maxX = Math.max(v.clampHigh, v.rawMultiple, ...rows.map((r) => Math.max(r.from, r.to))) + 0.1;
  const x = (n: number) => `${(Math.max(0, n) / maxX) * 100}%`;
  return (
    <div>
      {rows.map((r, i) => {
        const lo = Math.min(r.from, r.to);
        const hi = Math.max(r.from, r.to);
        return (
          <div key={i} className={`wf-row${r.kind === 'total' ? ' total' : ''}${r.kind === 'zero' ? ' dim' : ''}`}>
            <Explain tip={r.tip}>{r.label}</Explain>
            <div className="bar-area">
              {r.kind !== 'zero' && <div className={`wbar ${r.kind === 'neg' ? 'neg' : r.kind === 'total' ? 'total' : r.kind === 'clamp' ? 'clamp' : ''}`} style={{ left: x(lo), width: `calc(${x(hi)} - ${x(lo)} + 1px)` }} />}
              {r.kind === 'zero' && <div style={{ position: 'absolute', left: x(r.from), top: 2, width: 1, height: 12, background: 'var(--line-2)' }} />}
            </div>
            <span className="num">{r.val}</span>
          </div>
        );
      })}
      <div className="small muted" style={{ marginTop: 8 }}>Clamp range {mult(v.clampLow)}–{mult(v.clampHigh)} (sector range ±0.5x). Raw multiple before clamp {mult(v.rawMultiple)}.</div>
    </div>
  );
}

function SdeTable({ v }: { v: ValuationResult }) {
  const ys = v.sde.years;
  if (!ys.length) return <p className="muted">No financials.</p>;
  const row = (label: string, get: (i: number) => number | undefined, sign = '') => (
    <tr className="static"><td>{sign}{label}</td>{ys.map((y, i) => <td key={y.year} className="num">{aud(get(i))}</td>)}</tr>
  );
  return (
    <table className="data">
      <thead><tr><th>AUD</th>{ys.map((y) => <th key={y.year} className="num">Y{y.year}{y.year === 1 ? ' (latest)' : ''}</th>)}</tr></thead>
      <tbody>
        {row('Revenue', (i) => ys[i].revenue)}
        {row('Net profit (tax return)', (i) => ys[i].netProfit)}
        {row('Owner wage + super', (i) => ys[i].ownerWage, '+ ')}
        {row('Add-backs', (i) => ys[i].addbacks, '+ ')}
        {row('Negative adjustments', (i) => (ys[i].negatives ? -ys[i].negatives : 0), '− ')}
        {row('Maintenance capex', (i) => (ys[i].maintenanceCapex ? -ys[i].maintenanceCapex : 0), '− ')}
        <tr className="static" style={{ fontWeight: 600 }}><td>= SDE</td>{ys.map((y) => <td key={y.year} className="num">{aud(y.sde)}</td>)}</tr>
        <tr className="static"><td>Weight</td>{ys.map((y, i) => <td key={y.year} className="num">{pct((v.sde.weights[i] ?? 0) * 100)}</td>)}</tr>
        <tr className="static" style={{ fontWeight: 600 }}><td>Weighted SDE</td><td className="num" colSpan={ys.length}>{aud(v.sde.weighted)}</td></tr>
      </tbody>
    </table>
  );
}

function Inputs({ record }: { record: BizRecord }) {
  const rec = record as unknown as Record<string, unknown>;
  return (
    <div className="stack" style={{ gap: 12 }}>
      {GROUPS.map((g) => {
        const fs = FIELDS.filter((f) => f.group === g.id && rec[f.key] !== undefined && rec[f.key] !== '');
        if (!fs.length) return null;
        return (
          <div key={g.id}>
            <h3 style={{ marginBottom: 4 }}>{g.label}</h3>
            <table className="kv small">
              <tbody>
                {fs.map((f) => {
                  const val = rec[f.key];
                  const shown = typeof val === 'number'
                    ? f.unit === 'AUD' || f.unit === 'AUD/yr' ? aud(val) : f.unit === '%' ? `${val}%` : `${val}${f.unit && f.unit !== '0–5' ? ` ${f.unit}` : ''}`
                    : typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val);
                  return <tr key={f.key}><td><span className="mono">{f.key}</span></td><td className="num">{shown}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
