import { SECTORS } from '../engine/sectors';
import { DEFAULT_SETTINGS, type Settings } from '../engine/settings';
import type { BizRecord } from '../engine/types';
import type { CompsContext } from '../engine/value';
import { mult } from '../format';
import { download, recordsToCsv } from '../import/templates';

export function SettingsView({ settings, setSettings, comps, records, onClear }: {
  settings: Settings;
  setSettings: (s: Settings) => void;
  comps: CompsContext;
  records: BizRecord[];
  onClear: () => void;
}) {
  const num = (k: keyof Settings, label: string, note: string, step = 1) => (
    <label className="field">
      <span>{label}</span>
      <input type="number" step={step} value={settings[k] as number} onChange={(e) => setSettings({ ...settings, [k]: Number(e.target.value) })} />
      <span className="muted">{note}</span>
    </label>
  );
  const w = settings.weightsRising;
  const setW = (i: number, val: number) => {
    const next = [...w] as [number, number, number];
    next[i] = val / 100;
    setSettings({ ...settings, weightsRising: next });
  };
  const wSum = Math.round((w[0] + w[1] + w[2]) * 100);

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <h1>Settings</h1>
          <p className="ink2" style={{ margin: '6px 0 0' }}>Assumptions apply to every record and are stored in this browser. Factor weights are fixed in v1.</p>
        </div>
        <button className="btn" onClick={() => setSettings(DEFAULT_SETTINGS)}>Reset to defaults</button>
      </div>

      <div className="grid2">
        <div className="panel">
          <div className="panel-h"><h2>Pricing and lender test</h2></div>
          <div className="panel-b formgrid">
            {num('saleToAsking', 'Sale-to-asking ratio', 'Default 0.92; replace with your sold comps', 0.01)}
            {num('marketOwnerWage', 'Market owner wage (AUD)', 'Incl. super; deducted for the DSCR test', 1000)}
            {num('loanRatePct', 'Default loan rate (%)', 'Used when a record has no loan_rate_pct', 0.1)}
            {num('loanTermYears', 'Default loan term (yrs)', 'Default 5')}
            {num('buyerEquityPct', 'Buyer equity (%)', 'Cash deposit; the rest of the price is debt', 1)}
            {num('dscrMin', 'Minimum DSCR', '1.25 = the 25% buffer lenders look for', 0.05)}
          </div>
        </div>
        <div className="panel">
          <div className="panel-h"><h2>SDE weighting and multiple</h2></div>
          <div className="panel-b formgrid">
            <label className="field"><span>Rising: Y1 weight (%)</span><input type="number" value={Math.round(w[0] * 100)} onChange={(e) => setW(0, Number(e.target.value))} /></label>
            <label className="field"><span>Rising: Y2 weight (%)</span><input type="number" value={Math.round(w[1] * 100)} onChange={(e) => setW(1, Number(e.target.value))} /></label>
            <label className="field"><span>Rising: Y3 weight (%)</span><input type="number" value={Math.round(w[2] * 100)} onChange={(e) => setW(2, Number(e.target.value))} />
              <span className={wSum === 100 ? 'muted' : 'field-err'}>Sum {wSum}%{wSum === 100 ? '' : ' (should be 100%)'}</span></label>
            {num('fallingFactor', 'Falling: latest year ×', 'Lenders do not assume a turnaround', 0.05)}
            {num('clampPad', 'Clamp pad (turns)', 'Adjusted multiple stays within sector range ± this', 0.1)}
            {num('minComps', 'Comps needed per sector', 'Sold records before the base switches to their median')}
            <label className="field"><span>Use sold comparables</span>
              <select value={String(settings.useComparables)} onChange={(e) => setSettings({ ...settings, useComparables: e.target.value === 'true' })}>
                <option value="true">Yes</option><option value="false">No</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><h2>Base multiples</h2><span className="small muted">Source: Business For Sale, Aug 2026; market default 2.7x matches BizBuySell US Q1–Q2 2026</span></div>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Sector</th><th>ANZSIC prefixes</th><th className="num">Range</th><th className="num">Default base</th><th className="num">Sold comps</th><th className="num">Comps median</th><th className="num">Active base</th></tr></thead>
            <tbody>
              {SECTORS.map((s) => {
                const c = comps[s.id];
                const active = settings.useComparables && c && c.count >= settings.minComps ? c.median : s.base;
                return (
                  <tr key={s.id} className="static">
                    <td>{s.label}</td>
                    <td className="mono">{s.prefixes.join(', ') || 'any other'}</td>
                    <td className="num">{mult(s.min)}–{mult(s.max)}</td>
                    <td className="num">{mult(s.base)}</td>
                    <td className="num">{c?.count ?? 0}</td>
                    <td className="num">{c ? mult(c.median) : '—'}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{mult(active)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><h2>Data</h2><span className="small muted">{records.length} records stored locally in this browser (IndexedDB)</span></div>
        <div className="panel-b row">
          <button className="btn" disabled={!records.length} onClick={() => download('multiplier-all-records.csv', recordsToCsv(records))}>Export all as CSV</button>
          <button className="btn" disabled={!records.length} onClick={() => download('multiplier-all-records.json', JSON.stringify({ schema_version: '1.0', currency: 'AUD', records }, null, 2), 'application/json')}>Export all as JSON</button>
          <button className="btn danger" disabled={!records.length} onClick={() => { if (window.confirm(`Delete all ${records.length} records from this browser? This cannot be undone.`)) onClear(); }}>Delete all records</button>
        </div>
      </div>
    </div>
  );
}
