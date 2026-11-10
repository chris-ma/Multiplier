import { get, set } from 'idb-keyval';
import { DEFAULT_SETTINGS, type Settings } from './engine/settings';
import type { BizRecord } from './engine/types';

const K_RECORDS = 'multiplier:records:v1';
const K_SETTINGS = 'multiplier:settings:v1';

/** v1 storage is local to this browser (IndexedDB). Falls back to memory if IndexedDB is unavailable. */
let memRecords: BizRecord[] = [];
let memSettings: Settings = DEFAULT_SETTINGS;

export async function loadRecords(): Promise<BizRecord[]> {
  try { return ((await get(K_RECORDS)) as BizRecord[] | undefined) ?? []; } catch { return memRecords; }
}
export async function saveRecords(rs: BizRecord[]): Promise<void> {
  memRecords = rs;
  try { await set(K_RECORDS, rs); } catch { /* memory only */ }
}
export async function loadSettings(): Promise<Settings> {
  try {
    return { ...DEFAULT_SETTINGS, ...(((await get(K_SETTINGS)) as Partial<Settings> | undefined) ?? {}) };
  } catch { return memSettings; }
}
export async function saveSettings(s: Settings): Promise<void> {
  memSettings = s;
  try { await set(K_SETTINGS, s); } catch { /* memory only */ }
}

/** Upsert on record_id. */
export function upsert(existing: BizRecord[], incoming: BizRecord[]) {
  const map = new Map(existing.map((r) => [r.record_id, r]));
  let added = 0;
  let updated = 0;
  for (const r of incoming) {
    if (map.has(r.record_id)) updated++; else added++;
    map.set(r.record_id, r);
  }
  return { records: [...map.values()], added, updated };
}

/** Per-viewer conveniences (theme, mapping templates, saved views) in localStorage. */
export function lsGet<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
export function lsSet(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
}
