import type { FieldDef } from '../engine/fields';

export type Coerced = { ok: true; value: unknown } | { ok: false; error: string; suggestion?: string };

// 'none' is deliberately absent: it is a valid enum value (legal_issues, capacity_headroom).
const EMPTY = new Set(['', 'na', 'n/a', 'null', '-', '—']);

export function isBlank(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return EMPTY.has(v.trim().toLowerCase());
  return false;
}

/** Accepts $, commas, spaces, % and k/m suffixes. Returns NaN when unparseable. */
export function parseNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return NaN;
  let s = v.trim().replace(/[$,\s]/g, '').replace(/%$/, '').replace(/^AUD/i, '');
  let mult = 1;
  const m = /^(-?\d*\.?\d+)([kKmM])$/.exec(s);
  if (m) {
    s = m[1];
    mult = m[2].toLowerCase() === 'k' ? 1e3 : 1e6;
  }
  if (s.startsWith('(') && s.endsWith(')')) s = `-${s.slice(1, -1)}`;
  if (!/^-?\d*\.?\d+$/.test(s)) return NaN;
  return Number(s) * mult;
}

export function parseBoolean(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1 ? true : v === 0 ? false : undefined;
  const s = String(v).trim().toLowerCase();
  if (['true', 'yes', 'y', '1', 't'].includes(s)) return true;
  if (['false', 'no', 'n', '0', 'f'].includes(s)) return false;
  return undefined;
}

/** ISO (YYYY-MM-DD) or DD/MM/YYYY → ISO date string. */
export function parseDate(v: unknown): string | undefined {
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return valid(+m[3], +m[2], +m[1]);
  return undefined;
}
function valid(y: number, mo: number, d: number): string | undefined {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return undefined;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/** Common phrasings → enum values, for suggestions. */
const SYNONYMS: Record<string, string> = {
  for_sale: 'listed', active: 'listed', available: 'listed', on_market: 'listed',
  under_contract: 'under_offer', offer: 'under_offer', pending: 'under_offer',
  closed: 'sold', settled: 'sold', off_market: 'withdrawn', removed: 'withdrawn',
  owner_operator: 'on_tools', hands_on: 'on_tools', working_owner: 'on_tools', semi_absentee: 'manager', passive: 'absentee',
  accountant: 'accountant_prepared', bas: 'bas_only', owner: 'owner_prepared',
  cbd: 'metro_cbd', metropolitan: 'metro', city: 'metro', rural: 'regional',
  new_south_wales: 'NSW', victoria: 'VIC', queensland: 'QLD', western_australia: 'WA', south_australia: 'SA', tasmania: 'TAS', northern_territory: 'NT', australian_capital_territory: 'ACT',
};

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s-]+/g, '_');

export function nearestEnum(raw: string, options: readonly string[]): string | undefined {
  const n = norm(raw);
  const syn = SYNONYMS[n];
  if (syn && options.includes(syn)) return syn;
  let best: string | undefined;
  let bestD = Infinity;
  for (const o of options) {
    const d = levenshtein(n, o.toLowerCase());
    if (d < bestD) { bestD = d; best = o; }
  }
  return bestD <= Math.max(2, Math.floor(n.length / 3)) ? best : undefined;
}

export function coerceField(def: FieldDef, raw: unknown): Coerced {
  if (isBlank(raw)) return { ok: true, value: undefined };
  switch (def.type) {
    case 'string':
      return { ok: true, value: String(raw).trim() };
    case 'url': {
      const s = String(raw).trim();
      try { new URL(s); return { ok: true, value: s }; } catch { return { ok: false, error: `"${s}" is not a valid URL` }; }
    }
    case 'industry': {
      const s = String(raw).trim().toUpperCase();
      if (!/^[A-S]\d{3,4}$/.test(s)) return { ok: false, error: `"${raw}" is not an ANZSIC code (letter + 4 digits, e.g. H4511)` };
      return { ok: true, value: s };
    }
    case 'number': case 'integer': case 'percent': case 'signed_percent': case 'score05': {
      const n = parseNumber(raw);
      if (Number.isNaN(n)) return { ok: false, error: `"${raw}" is not a number` };
      return { ok: true, value: def.type === 'integer' ? Math.round(n) : n };
    }
    case 'boolean': {
      const b = parseBoolean(raw);
      if (b === undefined) return { ok: false, error: `"${raw}" is not true/false` };
      return { ok: true, value: b };
    }
    case 'date': {
      const d = parseDate(raw);
      if (!d) return { ok: false, error: `"${raw}" is not a date (use YYYY-MM-DD or DD/MM/YYYY)` };
      return { ok: true, value: d };
    }
    case 'enum': {
      const opts = def.options ?? [];
      const s = String(raw).trim();
      const exact = opts.find((o) => o.toLowerCase() === s.toLowerCase() || o.toLowerCase() === norm(s));
      if (exact) return { ok: true, value: exact };
      const sug = nearestEnum(s, opts);
      return { ok: false, error: `Unknown value "${s}" (allowed: ${opts.join(', ')})`, suggestion: sug };
    }
  }
}
