import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_SETTINGS, type Settings } from '../engine/settings';
import type { BizRecord } from '../engine/types';
import { buildComps, value } from '../engine/value';
import { autoMap, parseCsvText, validateRows } from '../import/validate';
import { loadRecords, loadSettings, lsGet, lsSet, saveRecords, saveSettings, upsert } from '../store';
import { Detail } from './Detail';
import { ImportView } from './ImportView';
import { MethodView } from './MethodView';
import { EMPTY_FILTERS, Portfolio, type Filters } from './Portfolio';
import { RecordForm } from './RecordForm';
import { SettingsView } from './SettingsView';

type View = 'portfolio' | 'detail' | 'import' | 'new' | 'edit' | 'settings' | 'method';
const VIEWS: View[] = ['portfolio', 'detail', 'import', 'new', 'edit', 'settings', 'method'];

interface Route { view: View; id?: string; filters: Filters }

function readRoute(): Route {
  const p = new URLSearchParams(window.location.search);
  const view = (VIEWS.includes(p.get('v') as View) ? p.get('v') : 'portfolio') as View;
  const filters = { ...EMPTY_FILTERS };
  (Object.keys(EMPTY_FILTERS) as (keyof Filters)[]).forEach((k) => { filters[k] = p.get(k) ?? ''; });
  return { view, id: p.get('id') ?? undefined, filters };
}
function writeRoute(r: Route, push: boolean) {
  const p = new URLSearchParams();
  if (r.view !== 'portfolio') p.set('v', r.view);
  if (r.id) p.set('id', r.id);
  if (r.view === 'portfolio') (Object.entries(r.filters) as [string, string][]).forEach(([k, val]) => { if (val) p.set(k, val); });
  const url = `${window.location.pathname}${p.toString() ? `?${p}` : ''}`;
  if (url === `${window.location.pathname}${window.location.search}`) return;
  if (push) window.history.pushState(null, '', url); else window.history.replaceState(null, '', url);
}

type Theme = 'system' | 'light' | 'dark';

export function App() {
  const [records, setRecords] = useState<BizRecord[]>([]);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [route, setRoute] = useState<Route>(readRoute);
  const [theme, setTheme] = useState<Theme>(() => lsGet<Theme>('multiplier:theme', 'system'));
  const [toastMsg, setToastMsg] = useState('');

  useEffect(() => { Promise.all([loadRecords(), loadSettings()]).then(([r, s]) => { setRecords(r); setSettingsState(s); setLoaded(true); }); }, []);
  useEffect(() => {
    const onPop = () => setRoute(readRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    lsSet('multiplier:theme', theme);
  }, [theme]);

  const go = useCallback((r: Partial<Route>, push = true) => {
    setRoute((cur) => {
      const next: Route = { view: r.view ?? cur.view, id: r.id, filters: r.filters ?? cur.filters };
      writeRoute(next, push);
      return next;
    });
    if (push) window.scrollTo({ top: 0 });
  }, []);

  const toast = useCallback((t: string) => { setToastMsg(t); setTimeout(() => setToastMsg(''), 2200); }, []);
  const persist = useCallback((rs: BizRecord[]) => { setRecords(rs); void saveRecords(rs); }, []);
  const setSettings = (s: Settings) => { setSettingsState(s); void saveSettings(s); };

  const comps = useMemo(() => buildComps(records, settings), [records, settings]);
  const items = useMemo(() => records.map((r) => ({ r, v: value(r, settings, { comps }) })), [records, settings, comps]);

  const commit = async (incoming: BizRecord[]) => {
    const res = upsert(records, incoming);
    persist(res.records);
    toast(`${res.added} added · ${res.updated} updated`);
    return res;
  };

  const loadSample = async () => {
    const text = await (await fetch('/sample-listings.csv')).text();
    const p = parseCsvText(text);
    const rows = validateRows(p.rows, autoMap(p.headers), settings);
    const ok = rows.filter((r) => r.record).map((r) => r.record!);
    await commit(ok);
  };

  const current = route.id ? records.find((r) => r.record_id === route.id) : undefined;
  const nav: [View, string][] = [['portfolio', 'Portfolio'], ['import', 'Import'], ['new', 'New record'], ['settings', 'Settings'], ['method', 'Method']];

  return (
    <>
      <header className="topbar">
        <div className="shell">
          <a className="wordmark" href="/" onClick={(e) => { e.preventDefault(); go({ view: 'portfolio' }); }}>
            Multiplier <span className="muted small">valuation screen · AU</span>
          </a>
          <nav className="nav" aria-label="Main">
            {nav.map(([v, l]) => (
              <button key={v} aria-current={route.view === v || (v === 'portfolio' && route.view === 'detail') ? 'page' : undefined} onClick={() => go({ view: v })}>{l}</button>
            ))}
          </nav>
          <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)} aria-label="Theme" style={{ fontSize: 12 }}>
            <option value="system">System theme</option><option value="light">Light</option><option value="dark">Dark</option>
          </select>
        </div>
      </header>

      <main className="shell">
        {!loaded ? <p className="muted">Loading…</p> : (
          <>
            {route.view === 'portfolio' && (
              <Portfolio items={items} filters={route.filters} setFilters={(f) => go({ view: 'portfolio', filters: f }, false)}
                onOpen={(id) => go({ view: 'detail', id })} onLoadSample={loadSample} onImport={() => go({ view: 'import' })} toast={toast} />
            )}
            {route.view === 'detail' && (current
              ? <Detail key={current.record_id} record={current} settings={settings} comps={comps}
                  onBack={() => go({ view: 'portfolio' })} onEdit={() => go({ view: 'edit', id: current.record_id })}
                  onDelete={() => { persist(records.filter((r) => r.record_id !== current.record_id)); go({ view: 'portfolio' }); toast('Record deleted'); }} />
              : <p className="muted">Record not found. <button className="btn sm" onClick={() => go({ view: 'portfolio' })}>Back to portfolio</button></p>)}
            {route.view === 'import' && <ImportView settings={settings} comps={comps} onCommit={commit} />}
            {(route.view === 'new' || route.view === 'edit') && (
              <RecordForm key={route.view + (route.id ?? '')} initial={route.view === 'edit' ? current : undefined} settings={settings} comps={comps}
                existingIds={records.map((r) => r.record_id)}
                onCancel={() => go(route.view === 'edit' && current ? { view: 'detail', id: current.record_id } : { view: 'portfolio' })}
                onSave={(r) => {
                  const base = route.view === 'edit' && current && current.record_id !== r.record_id ? records.filter((x) => x.record_id !== current.record_id) : records;
                  persist(upsert(base, [r]).records);
                  toast('Record saved');
                  go({ view: 'detail', id: r.record_id });
                }} />
            )}
            {route.view === 'settings' && <SettingsView settings={settings} setSettings={setSettings} comps={comps} records={records} onClear={() => { persist([]); toast('All records deleted'); }} />}
            {route.view === 'method' && <MethodView />}
          </>
        )}
      </main>

      <footer>
        <div className="shell">
          <p>Screening estimate, not a formal valuation or financial advice. Formal Australian valuations for tax follow the ATO's market valuation guidance and are done by a qualified valuer.</p>
          <p>Industry ranges are broker-published rules of thumb (Business For Sale, Aug 2026), not a register of closed sales; accuracy improves as you load your own sold records. Data stays in this browser. AUD · AEST.</p>
        </div>
      </footer>
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </>
  );
}
