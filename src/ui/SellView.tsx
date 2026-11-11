import { useMemo, useState } from 'react';
import { pricingPlan, readListPrice, type PricingPlan } from '../engine/sell';
import type { Settings } from '../engine/settings';
import type { BizRecord } from '../engine/types';
import type { CompsContext } from '../engine/value';
import { aud, mult, nowAest, ratio } from '../format';
import { parseNumber } from '../import/parse';
import type { SellDraft } from '../store';
import { Explain, verdictLabel } from './common';
import { PfvStrip } from './PfvStrip';
import { CHECKLIST, draftToResult, EXAMPLE_VALUES, SECTIONS, YEAR_ROWS, type Question } from './sellForm';

export function SellView({ initial, settings, comps, onSave, onSaved }: {
  initial: SellDraft;
  settings: Settings;
  comps: CompsContext;
  onSave: (d: SellDraft) => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState<SellDraft>(initial);
  const [dirty, setDirty] = useState(false);
  const setV = (k: string, val: string) => { setD((x) => ({ ...x, values: { ...x.values, [k]: val } })); setDirty(true); };

  const res = useMemo(() => draftToResult(d, settings, comps), [d, settings, comps]);
  const plan = useMemo(() => (res.record ? pricingPlan(res.record, settings, comps) : undefined), [res.record, settings, comps]);
  const errs = Object.fromEntries(res.issues.filter((i) => i.severity === 'reject').map((i) => [i.field, i.message]));
  const needed = [
    ...(!d.values.industry_preset && !d.values.industry_code ? ['your industry'] : []),
    ...([['revenue_y1', 'latest revenue'], ['net_profit_y1', 'latest net profit'], ['owner_wage_y1', 'your wage']] as const).filter(([k]) => !d.values[k]).map(([, l]) => l),
  ];

  const save = () => {
    const name = d.values.business_name?.trim() || d.name || 'My business';
    onSave({ ...d, name, updatedAt: new Date().toISOString() });
    setDirty(false);
  };

  return (
    <div className="stack">
      <div className="print-only small">Multiplier list-price guide · generated {nowAest()} AEST · screening estimate, not a formal valuation or financial advice</div>
      <div className="spread">
        <div>
          <h1>What should I list my business for?</h1>
          <p className="ink2" style={{ margin: '6px 0 0', maxWidth: '70ch' }}>
            Answer what you know; every answer tightens the range. You get a fair value, a list price that leaves room for negotiation, and how buyers screening listings will read it.
          </p>
        </div>
        <div className="row no-print">
          {!Object.keys(d.values).length && <button className="btn sm" onClick={() => { setD((x) => ({ ...x, values: { ...EXAMPLE_VALUES } })); setDirty(true); }}>Fill with an example</button>}
          <button className="btn sm" onClick={onSaved}>Saved valuations</button>
          <button className="btn sm" disabled={!plan} onClick={() => window.print()}>PDF summary</button>
          <button className="btn sm primary" onClick={save}>{dirty ? 'Save valuation' : 'Saved'}</button>
        </div>
      </div>

      <div className="sell-grid">
        <div className="sell-form panel panel-b no-print-inputs">
          {SECTIONS.map((sec, i) => (
            <details key={sec.id} className="group" open={i < 3 || sec.questions.some((q) => d.values[q.key])}>
              <summary><span>{sec.title}</span><span className="small muted">{sec.intro}</span></summary>
              {sec.id === 'earn' ? (
                <YearGrid values={d.values} setV={setV} errs={errs} />
              ) : (
                <div className="formgrid">
                  {sec.questions.filter((q) => !q.when || q.when(d.values)).map((q) => (
                    <Field key={q.key} q={q} value={d.values[q.key] ?? ''} onChange={(val) => setV(q.key, val)} err={errs[q.key]} />
                  ))}
                </div>
              )}
            </details>
          ))}
        </div>

        <div className="sell-result">
          {plan && res.record ? (
            <Result plan={plan} record={res.record} settings={settings} d={d} setD={(x) => { setD(x); setDirty(true); }} />
          ) : (
            <div className="panel panel-b stack">
              <h2>Your list price</h2>
              <p className="ink2" style={{ margin: 0 }}>
                {needed.length
                  ? <>Still needed for a price: {needed.join(', ')}.</>
                  : <>Fix the highlighted answers to see a price.</>}
              </p>
              {!needed.length && Object.entries(errs).map(([k, m]) => <div key={k} className="flag bad">{k.replace(/_/g, ' ')}: {m}</div>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ q, value, onChange, err }: { q: Question; value: string; onChange: (v: string) => void; err?: string }) {
  const id = `s-${q.key}`;
  let input;
  if (q.kind === 'select') {
    input = (
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {q.options!.map(([v, l]) => <option key={v || 'other'} value={v}>{l}</option>)}
      </select>
    );
  } else if (q.kind === 'yesno') {
    input = (
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option><option value="true">Yes</option><option value="false">No</option>
      </select>
    );
  } else {
    const numeric = q.kind !== 'text';
    input = (
      <div className={`affix${q.kind === 'money' ? ' pre' : ''}${q.kind === 'pct' ? ' post' : ''}`}>
        {q.kind === 'money' && <span>$</span>}
        <input id={id} type="text" inputMode={numeric ? 'decimal' : undefined} value={value} onChange={(e) => onChange(e.target.value)} style={numeric ? { textAlign: 'right' } : undefined} />
        {q.kind === 'pct' && <span>%</span>}
      </div>
    );
  }
  return (
    <label className="field" htmlFor={id}>
      <span>{q.label}</span>
      {input}
      {err ? <span className="field-err">{err}</span> : q.help ? <span className="muted">{q.help}</span> : null}
    </label>
  );
}

function YearGrid({ values, setV, errs }: { values: Record<string, string>; setV: (k: string, v: string) => void; errs: Record<string, string> }) {
  return (
    <div className="tablewrap">
      <table className="yeargrid">
        <thead><tr><th /><th className="num">Latest year *</th><th className="num">Prior year</th><th className="num">Two years ago</th></tr></thead>
        <tbody>
          {YEAR_ROWS.map(([base, label, help]) => (
            <tr key={base}>
              <th scope="row">{help ? <Explain tip={help}>{label}</Explain> : label}</th>
              {[1, 2, 3].map((n) => {
                const k = `${base}_y${n}`;
                return (
                  <td key={k}>
                    <div className="affix pre"><span>$</span><input type="text" inputMode="decimal" aria-label={`${label} year ${n}`} value={values[k] ?? ''} onChange={(e) => setV(k, e.target.value)} style={{ textAlign: 'right' }} /></div>
                    {errs[k] && <div className="field-err">{errs[k]}</div>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Result({ plan, record, settings, d, setD }: { plan: PricingPlan; record: BizRecord; settings: Settings; d: SellDraft; setD: (d: SellDraft) => void }) {
  const fv = plan.fv;
  const rec = plan.strategies.find((s) => s.id === plan.recommended)!;
  const custom = parseNumber(d.listPrice ?? '');
  const chosen = !Number.isNaN(custom) && custom > 0 ? custom : rec.listPrice;
  const read = readListPrice(plan, chosen, settings, record);
  const stripV = { ...fv, price: chosen, pfv: read.pfv, verdict: read.verdict, confirmed: read.confirmed };
  const tighten = fv.bandPct > 0.1 && !fv.requiresReview;

  if (fv.lossMaking) {
    return (
      <div className="panel panel-b stack">
        <h2>Your business is valued on its assets</h2>
        <p className="ink2" style={{ margin: 0 }}>Weighted owner earnings are at or below zero, so buyers pay for assets only (zero goodwill). Asset value: <b>{aud(fv.fvPoint)}</b>. Add the value of plant and equipment under Sale terms for a fuller figure, and see Raise your price for what lifts earnings.</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="panel panel-b stack">
        <div>
          <h3>Recommended list price</h3>
          <div className="hero-num" style={{ marginTop: 6 }}>{aud(rec.listPrice)}</div>
          <div className="small ink2" style={{ marginTop: 4 }}>
            Expected sale about <b>{aud(rec.expectedSale)}</b> · fair value <Explain tip={<>Owner earnings (weighted SDE) {aud(fv.sde.weighted)} × {mult(fv.adjustedMultiple)} multiple{fv.inventory ? ` + stock ${aud(fv.inventory)}` : ''}{fv.excessAssets ? ` + assets ${aud(fv.excessAssets)}` : ''}{fv.deferredCapex ? ` − overdue capex ${aud(fv.deferredCapex)}` : ''}. Range ±{Math.round(fv.bandPct * 100)}% ({fv.bandReason.toLowerCase()}).</>}>{aud(fv.fvPoint)}</Explain> ({aud(fv.fvLow)}–{aud(fv.fvHigh)})
          </div>
          <div className="small muted" style={{ marginTop: 4 }}>{plan.recommendedReason}</div>
        </div>

        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Strategy</th><th className="num">List at</th><th className="num">Expect</th><th>Buyers see</th><th className="num"><Explain right tip={`Can a buyer with ${settings.buyerEquityPct}% deposit fund the rest with a bank loan at ${settings.loanRatePct}% over ${settings.loanTermYears} years, keeping DSCR ≥ ${settings.dscrMin}?`}>Bank-fundable</Explain></th></tr></thead>
            <tbody>
              {plan.strategies.map((s) => (
                <tr key={s.id} className={s.id === plan.recommended ? '' : ''} onClick={() => setD({ ...d, listPrice: String(s.listPrice) })} title={s.description}>
                  <td><Explain tip={s.description}>{s.label}</Explain>{s.id === plan.recommended && <span className="muted"> · recommended</span>}</td>
                  <td className="num">{aud(s.listPrice)}</td>
                  <td className="num">{aud(s.expectedSale)}</td>
                  <td><span className={`vtag v-${s.verdict}`}>{verdictLabel(s.verdict)}</span></td>
                  <td className="num">{s.financeable ? 'Yes' : 'No'} <span className="muted">({ratio(s.dscr)})</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="small ink2">
          Highest bank-fundable price: <b>{plan.maxFinanceable > 0 ? aud(plan.maxFinanceable) : 'none'}</b>
          {plan.maxFinanceable <= 0 && ' (earnings do not cover a market owner wage, so buyers need vendor finance or their own cash)'}
          {plan.maxFinanceable > 0 && rec.listPrice > plan.maxFinanceable && ` · at the recommended price, about ${aud(rec.listPrice - plan.maxFinanceable)} would need vendor finance, an earn-out or a larger buyer deposit`}
          {record.vendor_finance_pct ? ` · you offer ${record.vendor_finance_pct}% vendor finance, which widens the buyer pool` : ''}
        </div>
      </div>

      <div className="panel panel-b stack">
        <div className="spread">
          <h2>Test your own price</h2>
          <div className="affix pre" style={{ maxWidth: 180 }}>
            <span>$</span>
            <input type="text" inputMode="decimal" aria-label="Your list price" placeholder={String(rec.listPrice)} value={d.listPrice ?? ''} onChange={(e) => setD({ ...d, listPrice: e.target.value })} style={{ textAlign: 'right' }} />
          </div>
        </div>
        <PfvStrip v={stripV} />
        <div className="small">
          At {aud(chosen)} buyers screening on price-to-fair-value see <span className={`vtag v-${read.verdict}${read.confirmed ? '' : ' unconfirmed'}`}>{verdictLabel(read.verdict)}</span>
          {' '}(P/FV {ratio(read.pfv)}{read.confirmed ? '' : ', within margin of error'}). Expected sale about {aud(read.expectedSale)}. {read.financeable ? 'Bank-fundable.' : `Not bank-fundable (DSCR ${ratio(read.dscr)}).`}
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><h2>Raise your price</h2><span className="small muted">Fair value added by each fix</span></div>
        <div className="panel-b">
          {plan.unverifiedAtRisk > 1000 && (
            <div className="driver">
              <span className="num driver-amt">{aud(plan.unverifiedAtRisk)}</span>
              <div><b>At risk: unproven add-backs.</b> <span className="ink2">{plan.addbacksVerifiedKnown ? 'A buyer\'s accountant will strip add-backs you cannot document.' : 'You have not said how many add-backs you can prove; all are at risk until you do.'} Gather invoices and statements for each one.</span></div>
            </div>
          )}
          {plan.drivers.slice(0, 7).map((x) => (
            <div key={x.factorId} className="driver">
              <span className="num driver-amt">{x.missingData ? 'Add data' : `+${aud(x.uplift)}`}</span>
              <div>
                <b>{x.name}.</b> <span className="ink2">{x.missingData ? `Not scored yet; up to +${aud(x.uplift)} if strong. ` : ''}{x.action}</span>
              </div>
            </div>
          ))}
          {!plan.drivers.length && <p className="muted small" style={{ margin: 0 }}>Every factor is already at its best score.</p>}
          <p className="small muted" style={{ margin: '8px 0 0' }}>Uplifts are measured one at a time and respect the {fv.sector.label} range cap ({mult(fv.clampLow)}–{mult(fv.clampHigh)}), so they do not simply add up.</p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><h2>Before you list</h2><span className="small muted">{Object.values(d.checklist ?? {}).filter(Boolean).length} of {CHECKLIST.length} ready</span></div>
        <div className="panel-b">
          {CHECKLIST.map(([k, l]) => (
            <label key={k} className="check">
              <input type="checkbox" checked={!!d.checklist?.[k]} onChange={(e) => setD({ ...d, checklist: { ...d.checklist, [k]: e.target.checked } })} /> {l}
            </label>
          ))}
          {tighten && <p className="small muted" style={{ margin: '8px 0 0' }}>Your range is ±{Math.round(fv.bandPct * 100)}% because {fv.optionalPresent} optional details are filled in; answering 20 or more narrows it to ±10%.</p>}
          {[...fv.overrideNotes, ...fv.flags.filter((f) => !f.startsWith('Unfinanceable'))].map((f) => <div key={f} className="flag warn" style={{ marginTop: 8 }}>{f}</div>)}
        </div>
      </div>
    </div>
  );
}
