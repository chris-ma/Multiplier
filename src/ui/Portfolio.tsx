import { useMemo, useState } from 'react';
import { SECTORS, SECTOR_BY_ID } from '../engine/sectors';
import { STATES, STATUSES } from '../engine/types';
import { VERDICTS } from '../engine/value';
import { aud, mult, ratio } from '../format';
import { lsGet, lsSet } from '../store';
import { download, recordsToCsv } from '../import/templates';
import { Explain, MiniBar, VerdictTag, verdictLabel } from './common';
import { Scatter, type Item } from './Scatter';

export interface Filters { sector: string; state: string; status: string; verdict: string; q: string; pfvMax: string; pfvMin: string }
export const EMPTY_FILTERS: Filters = { sector: '', state: '', status: '', verdict: '', q: '', pfvMax: '', pfvMin: '' };

type SortKey = 'id' | 'name' | 'sector' | 'state' | 'status' | 'sde' | 'price' | 'fv' | 'implied' | 'adj' | 'pfv' | 'dscr';
interface SavedView { name: string; filters: Filters }
const LS_VIEWS = 'multiplier:views';

export function applyFilters(items: Item[], f: Filters): Item[] {
  const q = f.q.trim().toLowerCase();
  return items.filter(({ r, v }) =>
    (!f.sector || v.sector.id === f.sector) &&
    (!f.state || r.state === f.state) &&
    (!f.status || r.status === f.status) &&
    (!f.verdict || v.verdict === f.verdict) &&
    (!f.pfvMax || (v.pfv !== undefined && v.pfv < Number(f.pfvMax))) &&
    (!f.pfvMin || (v.pfv !== undefined && v.pfv > Number(f.pfvMin))) &&
    (!q || r.business_name.toLowerCase().includes(q) || r.record_id.toLowerCase().includes(q)),
  );
}

export function Portfolio({ items, filters, setFilters, onOpen, onLoadSample, onImport, toast }: {
  items: Item[];
  filters: Filters;
  setFilters: (f: Filters) => void;
  onOpen: (id: string) => void;
  onLoadSample: () => void;
  onImport: () => void;
  toast: (t: string) => void;
}) {
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'pfv', dir: -1 });
  const [views, setViews] = useState<SavedView[]>(() => lsGet(LS_VIEWS, []));
  const filtered = useMemo(() => applyFilters(items, filters), [items, filters]);
  const sorted = useMemo(() => {
    const val = ({ r, v }: Item): string | number => {
      switch (sort.k) {
        case 'id': return r.record_id;
        case 'name': return r.business_name.toLowerCase();
        case 'sector': return v.sector.label;
        case 'state': return r.state;
        case 'status': return r.status;
        case 'sde': return v.sde.weighted;
        case 'price': return v.price ?? -Infinity;
        case 'fv': return v.fvPoint;
        case 'implied': return v.impliedMultiple ?? -Infinity;
        case 'adj': return v.adjustedMultiple;
        case 'pfv': return v.pfv ?? -Infinity;
        case 'dscr': return v.dscr ?? -Infinity;
      }
    };
    return [...filtered].sort((a, b) => {
      const x = val(a); const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [filtered, sort]);

  if (!items.length) {
    return (
      <div className="panel empty">
        <h1>Which listings are mispriced?</h1>
        <p>Load listed and sold businesses to score each one as normalised SDE × a risk-adjusted multiple, then compare price to fair value.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn primary" onClick={onLoadSample}>Load sample data (24 fictional listings)</button>
          <button className="btn" onClick={onImport}>Import CSV or JSON</button>
        </div>
      </div>
    );
  }

  const sector = filters.sector ? SECTOR_BY_ID[filters.sector] : SECTOR_BY_ID.other;
  const counts = Object.fromEntries(VERDICTS.map((vd) => [vd.id, filtered.filter((i) => i.v.verdict === vd.id).length]));
  const unfin = filtered.filter((i) => i.v.unfinanceable).length;
  const set = (k: keyof Filters, val: string) => setFilters({ ...filters, [k]: val });
  const th = (k: SortKey, label: string, num = false, tip?: string) => (
    <th className={`sortable${num ? ' num' : ''}`} onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : num ? -1 : 1 }))} aria-sort={sort.k === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      {tip ? <Explain tip={tip} right={num}>{label}</Explain> : label}{sort.k === k ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
    </th>
  );

  const saveView = () => {
    const name = window.prompt('Name this view (e.g. NSW cafés listed under 0.95 P/FV)');
    if (!name) return;
    const next = [...views.filter((v) => v.name !== name), { name, filters }];
    setViews(next); lsSet(LS_VIEWS, next); toast('View saved');
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.href); toast('Link copied'); } catch { toast('Copy failed: use the address bar'); }
  };
  const exportCsv = () => {
    download(`multiplier-export-${new Date().toISOString().slice(0, 10)}.csv`, recordsToCsv(sorted.map((i) => i.r), (r) => {
      const v = sorted.find((i) => i.r.record_id === r.record_id)!.v;
      return {
        calc_weighted_sde: Math.round(v.sde.weighted), calc_base_multiple: v.baseMultiple.toFixed(2), calc_adjusted_multiple: v.adjustedMultiple.toFixed(2),
        calc_fair_value: Math.round(v.fvPoint), calc_fv_low: Math.round(v.fvLow), calc_fv_high: Math.round(v.fvHigh), calc_pfv: v.pfv?.toFixed(3) ?? '',
        calc_verdict: v.verdict ?? '', calc_confirmed: String(v.confirmed), calc_dscr: v.dscr?.toFixed(2) ?? '', calc_unfinanceable: String(v.unfinanceable),
      };
    }));
  };

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <h1>Which listings are mispriced?</h1>
          <p className="summary-line" style={{ margin: '6px 0 0' }}>
            <b>{filtered.length}</b> of {items.length} records ·{' '}
            <b>{counts.well_above + counts.above}</b> above fair value · <b>{counts.fair}</b> fair ·{' '}
            <b>{counts.below + counts.well_below}</b> below · <b>{unfin}</b> unfinanceable at asking
          </p>
        </div>
        <div className="row no-print">
          <button className="btn sm" onClick={copyLink}>Copy link to view</button>
          <button className="btn sm" onClick={saveView}>Save view</button>
          <button className="btn sm" onClick={exportCsv}>Export CSV</button>
        </div>
      </div>

      <div className="filters no-print" role="group" aria-label="Filters">
        <input type="text" placeholder="Search name or ID" value={filters.q} onChange={(e) => set('q', e.target.value)} style={{ width: 180, fontSize: 12 }} />
        <select value={filters.sector} onChange={(e) => set('sector', e.target.value)} aria-label="Sector">
          <option value="">All sectors</option>
          {SECTORS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select value={filters.state} onChange={(e) => set('state', e.target.value)} aria-label="State">
          <option value="">All states</option>
          {STATES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => set('status', e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <select value={filters.verdict} onChange={(e) => set('verdict', e.target.value)} aria-label="Verdict">
          <option value="">All verdicts</option>
          {VERDICTS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
        <select value={filters.pfvMax ? `<${filters.pfvMax}` : filters.pfvMin ? `>${filters.pfvMin}` : ''} aria-label="P/FV"
          onChange={(e) => {
            const x = e.target.value;
            setFilters({ ...filters, pfvMax: x.startsWith('<') ? x.slice(1) : '', pfvMin: x.startsWith('>') ? x.slice(1) : '' });
          }}>
          <option value="">Any P/FV</option>
          <option value="<0.95">P/FV under 0.95</option>
          <option value="<0.85">P/FV under 0.85</option>
          <option value=">1.05">P/FV over 1.05</option>
          <option value=">1.15">P/FV over 1.15</option>
        </select>
        {views.length > 0 && (
          <select value="" onChange={(e) => { const v = views.find((x) => x.name === e.target.value); if (v) setFilters({ ...EMPTY_FILTERS, ...v.filters }); }} aria-label="Saved views">
            <option value="">Saved views…</option>
            {views.map((v) => <option key={v.name}>{v.name}</option>)}
          </select>
        )}
        {JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS) && <button className="btn sm ghost" onClick={() => setFilters(EMPTY_FILTERS)}>Clear</button>}
      </div>

      <div className="panel">
        <div className="panel-b">
          <Scatter items={filtered} sector={sector} onSelect={onOpen} />
        </div>
      </div>

      <div className="panel">
        <div className="tablewrap">
          <table className="data">
            <thead>
              <tr>
                {th('id', 'ID')}
                {th('name', 'Business')}
                {th('sector', 'Sector')}
                {th('state', 'State')}
                {th('status', 'Status')}
                {th('sde', 'Wtd SDE (AUD)', true, 'Normalised SDE, weighted across up to three years')}
                {th('price', 'Price (AUD)', true, 'Asking price, or sale price for sold records')}
                {th('fv', 'Fair value (AUD)', true, 'Weighted SDE × adjusted multiple + stock + excess assets − deferred capex')}
                {th('implied', 'Implied', true, 'Price ÷ weighted SDE')}
                {th('adj', 'Adj. multiple', true, 'Base multiple + factor turns, clamped to the sector range ±0.5x')}
                {th('pfv', 'P/FV', true, 'Price ÷ fair value point. 1.00 = priced exactly at fair value')}
                <th>Verdict</th>
                {th('dscr', 'DSCR', true, '(SDE − market owner wage) ÷ annual debt service at asking. Lenders want ≥ 1.25')}
              </tr>
            </thead>
            <tbody>
              {sorted.map(({ r, v }) => (
                <tr key={r.record_id} onClick={() => onOpen(r.record_id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(r.record_id)}>
                  <td className="mono">{r.record_id}</td>
                  <td className="name" title={r.business_name}>{r.business_name}</td>
                  <td className="ink2">{v.sector.label.split(' (')[0]}</td>
                  <td>{r.state}</td>
                  <td className="ink2">{r.status.replace('_', ' ')}</td>
                  <td className="num">{aud(v.sde.weighted)}</td>
                  <td className="num">{aud(v.price)}</td>
                  <td className="num">{aud(v.fvPoint)}</td>
                  <td className="num">{mult(v.impliedMultiple)}</td>
                  <td className="num">{mult(v.adjustedMultiple)}</td>
                  <td className="num"><MiniBar v={v} /></td>
                  <td><span title={verdictLabel(v.verdict)}><VerdictTag v={v} short /></span></td>
                  <td className="num" style={{ color: v.unfinanceable ? 'var(--v-well-above)' : undefined }}>{ratio(v.dscr)}</td>
                </tr>
              ))}
              {!sorted.length && <tr className="static"><td colSpan={13} className="muted" style={{ padding: 24, textAlign: 'center' }}>No records match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
