import { FIELD_MAP } from '../engine/fields';

type Obj = Record<string, unknown>;

const NESTED_ALIASES: Record<string, string> = {
  'price.asking': 'asking_price',
  'price.sale': 'sale_price',
  'price.includes_stock': 'price_includes_stock',
  'price.stock_at_cost': 'stock_at_cost',
  'lease.years_remaining': 'lease_years_remaining',
  'lease.options_years': 'lease_options_years',
  'lease.rent_pct_revenue': 'rent_pct_revenue',
  'lease.freehold_included': 'freehold_included',
};

interface Item { label?: string; amount?: unknown; verified?: boolean }

const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(/[$,]/g, '')) : NaN);

function sumItems(v: unknown): { total: number; verified: number } | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) {
    const n = num(v);
    return Number.isNaN(n) ? undefined : { total: n, verified: 0 };
  }
  let total = 0;
  let verified = 0;
  for (const it of v as Item[]) {
    const a = num(it?.amount);
    if (Number.isNaN(a)) continue;
    total += a;
    if (it.verified) verified += a;
  }
  return { total, verified };
}

const yearKey = (y: unknown) => {
  const m = /(\d{2,4})/.exec(String(y ?? ''));
  return m ? Number(m[1]) : -Infinity;
};

/**
 * Flatten one nested JSON record (spec §6 sample) into flat schema keys.
 * Already-flat records pass through. `financials[]` can hold any number of years;
 * the latest three are kept (y1 = latest). Itemised add-backs are summed and
 * `addbacks_verified_pct` is derived when not given.
 */
export function flattenJsonRecord(rec: Obj): Obj {
  const out: Obj = {};
  for (const [k, v] of Object.entries(rec)) {
    if (k === 'financials' && Array.isArray(v)) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [ik, iv] of Object.entries(v as Obj)) {
        const alias = NESTED_ALIASES[`${k}.${ik}`];
        if (alias) out[alias] = iv;
        else if (FIELD_MAP[ik]) out[ik] = iv;
        else out[`${k}.${ik}`] = iv;
      }
    } else {
      out[k] = v;
    }
  }

  if (Array.isArray(rec.financials)) {
    const years = [...(rec.financials as Obj[])].sort((a, b) => yearKey(b.year) - yearKey(a.year)).slice(0, 3);
    let addTotal = 0;
    let addVerified = 0;
    let itemised = false;
    years.forEach((y, i) => {
      const n = i + 1;
      if (y.revenue !== undefined) out[`revenue_y${n}`] = y.revenue;
      if (y.net_profit !== undefined) out[`net_profit_y${n}`] = y.net_profit;
      if (y.owner_wage !== undefined) out[`owner_wage_y${n}`] = y.owner_wage;
      const ab = sumItems(y.addbacks);
      if (ab) {
        out[`addbacks_y${n}`] = ab.total;
        if (Array.isArray(y.addbacks)) { itemised = true; addTotal += ab.total; addVerified += ab.verified; }
      }
      const neg = sumItems(y.negative_adjustments);
      if (neg) out[`negative_adjustments_y${n}`] = Math.abs(neg.total);
      if (y.abnormal === true) out.abnormal_year = n;
    });
    if (itemised && out.addbacks_verified_pct === undefined && addTotal > 0) {
      out.addbacks_verified_pct = Math.round((addVerified / addTotal) * 1000) / 10;
    }
  }
  return out;
}

export function parseJsonFile(text: string): { rows: Obj[]; error?: string } {
  let data: unknown;
  try { data = JSON.parse(text); } catch (e) { return { rows: [], error: `Invalid JSON: ${(e as Error).message}` }; }
  const list = Array.isArray(data) ? data : (data as Obj)?.records;
  if (!Array.isArray(list)) return { rows: [], error: 'Expected an array of records or { "records": [...] }' };
  if ((data as Obj)?.currency && (data as Obj).currency !== 'AUD') return { rows: [], error: `Currency ${(data as Obj).currency} not supported in v1 (AUD only)` };
  return { rows: list.map((r) => flattenJsonRecord(r as Obj)) };
}
