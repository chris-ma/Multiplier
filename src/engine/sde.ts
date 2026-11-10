import type { BizRecord } from './types';
import type { Settings } from './settings';

export interface SdeYear {
  year: 1 | 2 | 3;
  revenue?: number;
  netProfit: number;
  ownerWage: number;
  addbacks: number;
  negatives: number;
  maintenanceCapex: number;
  sde: number;
}

export type WeightingRule = 'single' | 'rising' | 'falling' | 'volatile' | 'volatile_drop_abnormal';

export interface WeightedSde {
  years: SdeYear[];
  weights: number[];
  weighted: number;
  rule: WeightingRule;
  ruleLabel: string;
}

/** Step 1: normalised SDE for one year. Negative adjustments are subtracted whatever sign they are entered with. */
export function sdeForYear(r: BizRecord, n: 1 | 2 | 3): SdeYear | undefined {
  const np = r[`net_profit_y${n}` as const];
  if (np === undefined || np === null || Number.isNaN(np)) return undefined;
  const ownerWage = r[`owner_wage_y${n}` as const] ?? 0;
  const addbacks = r[`addbacks_y${n}` as const] ?? 0;
  const negatives = Math.abs(r[`negative_adjustments_y${n}` as const] ?? 0);
  const maintenanceCapex = Math.abs(r.maintenance_capex ?? 0);
  return {
    year: n,
    revenue: r[`revenue_y${n}` as const],
    netProfit: np,
    ownerWage,
    addbacks,
    negatives,
    maintenanceCapex,
    sde: np + ownerWage + addbacks - negatives - maintenanceCapex,
  };
}

export function sdeYears(r: BizRecord): SdeYear[] {
  const out: SdeYear[] = [];
  for (const n of [1, 2, 3] as const) {
    const y = sdeForYear(r, n);
    if (!y) break; // years must be contiguous from the latest
    out.push(y);
  }
  return out;
}

/** Step 2: weight the years. y[0] is the latest. */
export function weightSde(r: BizRecord, s: Settings): WeightedSde {
  const years = sdeYears(r);
  const v = years.map((y) => y.sde);
  if (v.length <= 1) {
    return { years, weights: [1], weighted: v[0] ?? 0, rule: 'single', ruleLabel: 'Single year: latest SDE' };
  }
  const rising = v.every((x, i) => i === 0 || v[i - 1] > x);
  const falling = v.every((x, i) => i === 0 || v[i - 1] < x);
  if (rising) {
    let w: number[];
    if (v.length === 3) w = [...s.weightsRising];
    else {
      const t = s.weightsRising[0] + s.weightsRising[1];
      w = [s.weightsRising[0] / t, s.weightsRising[1] / t];
    }
    const weighted = v.reduce((a, x, i) => a + x * w[i], 0);
    return { years, weights: w, weighted, rule: 'rising', ruleLabel: `Rising each year: ${w.map((x) => Math.round(x * 100)).join(' / ')} (latest first)` };
  }
  if (falling) {
    const w = v.map((_, i) => (i === 0 ? s.fallingFactor : 0));
    return { years, weights: w, weighted: v[0] * s.fallingFactor, rule: 'falling', ruleLabel: `Falling each year: latest year × ${s.fallingFactor}` };
  }
  const ab = r.abnormal_year;
  if (ab && ab >= 1 && ab <= v.length && v.length === 3) {
    const keep = v.map((_, i) => i + 1 !== ab);
    const k = keep.filter(Boolean).length;
    const w = keep.map((x) => (x ? 1 / k : 0));
    const weighted = v.reduce((a, x, i) => a + x * w[i], 0);
    return { years, weights: w, weighted, rule: 'volatile_drop_abnormal', ruleLabel: `Volatile: documented abnormal Y${ab} dropped, equal weights` };
  }
  const w = v.map(() => 1 / v.length);
  const weighted = v.reduce((a, x) => a + x, 0) / v.length;
  return { years, weights: w, weighted, rule: 'volatile', ruleLabel: v.length === 3 ? 'Volatile: equal thirds' : 'Volatile: equal halves' };
}

/** CAGR from the oldest to the latest available SDE, in %. Undefined if not computable. */
export function sdeCagr(years: SdeYear[]): number | undefined {
  if (years.length < 2) return undefined;
  const latest = years[0].sde;
  const oldest = years[years.length - 1].sde;
  if (oldest <= 0 || latest <= 0) return undefined;
  return (Math.pow(latest / oldest, 1 / (years.length - 1)) - 1) * 100;
}
