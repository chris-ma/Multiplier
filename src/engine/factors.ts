import type { BizRecord, LocationTier } from './types';

export type FactorId =
  | 'owner' | 'growth' | 'recurring' | 'concentration' | 'lease' | 'size' | 'legal'
  | 'records' | 'outlook' | 'location' | 'staff' | 'supplier' | 'assets';

export interface FactorDef {
  id: FactorId;
  num: number;
  name: string;
  /** Max swing in turns. w = swing / 2. */
  swing: number;
  /** Legal has no upside: score is capped at 0. */
  noUpside?: boolean;
  thresholds: { m2: string; z: string; p2: string };
}

/** Spec §4. Confirmed v1 defaults; fixed in v1. */
export const FACTORS: FactorDef[] = [
  { id: 'owner', num: 1, name: 'Owner dependency', swing: 0.5, thresholds: { m2: 'Owner on tools, no manager, no SOPs', z: 'Owner manages, partial SOPs', p2: 'Absentee or manager in place, SOPs documented' } },
  { id: 'growth', num: 2, name: 'Earnings growth', swing: 0.4, thresholds: { m2: 'SDE CAGR below −5%', z: '0% to 5%', p2: 'Above 15%' } },
  { id: 'recurring', num: 3, name: 'Recurring revenue', swing: 0.4, thresholds: { m2: 'Under 10%', z: '25% to 50%', p2: 'Over 75%, contracts 12+ months' } },
  { id: 'concentration', num: 4, name: 'Customer concentration', swing: 0.35, thresholds: { m2: 'Top customer over 30%', z: '10% to 20%', p2: 'Under 5%' } },
  { id: 'lease', num: 5, name: 'Lease security', swing: 0.35, thresholds: { m2: 'Under 1 year, no option', z: '2 to 3 years incl. options', p2: '5+ years with options, rent under 10% of revenue' } },
  { id: 'size', num: 6, name: 'Size band (SDE)', swing: 0.3, thresholds: { m2: 'Under $100k', z: '$100k to $500k', p2: 'Over $1m' } },
  { id: 'legal', num: 7, name: 'Legal and compliance', swing: 0.3, noUpside: true, thresholds: { m2: 'Material dispute or non-compliance', z: 'None', p2: 'None (no upside)' } },
  { id: 'records', num: 8, name: 'Financial record quality', swing: 0.25, thresholds: { m2: 'Owner-prepared, under 50% add-backs verified', z: 'BAS only', p2: 'Accountant-prepared, 90%+ add-backs verified' } },
  { id: 'outlook', num: 9, name: 'Industry outlook and growth prospects', swing: 0.25, thresholds: { m2: 'Declining sector, no headroom', z: 'Stable', p2: 'Growing sector, capacity headroom' } },
  { id: 'location', num: 10, name: 'Location demand', swing: 0.2, thresholds: { m2: 'Remote, population falling', z: 'Regional city, flat', p2: 'Metro, population growth over 2%' } },
  { id: 'staff', num: 11, name: 'Staff and management depth', swing: 0.2, thresholds: { m2: 'Key staff likely to leave, high turnover', z: 'Stable small team', p2: 'Licensed team, second-in-charge' } },
  { id: 'supplier', num: 12, name: 'Supplier concentration', swing: 0.15, thresholds: { m2: 'One supplier, no alternative (70%+)', z: 'Main supplier, alternatives exist (30–50%)', p2: 'Diversified supply (under 15%)' } },
  { id: 'assets', num: 13, name: 'Asset condition', swing: 0.15, thresholds: { m2: 'Deferred capex over 10% of FV', z: 'Normal wear', p2: 'Recently renewed' } },
];

export interface FactorInputs {
  r: BizRecord;
  weightedSde: number;
  cagr?: number;
  tier?: LocationTier;
  /** Pre-adjustment FV estimate (SDE × base) used to size deferred capex without circularity. */
  fvEstimate: number;
}

export interface Scored {
  score: number | null;
  reason: string;
}

const clampScore = (x: number) => Math.max(-2, Math.min(2, x));
const pct = (x: number) => `${Math.round(x * 10) / 10}%`;

/** Band a value: returns −2..+2 given ascending cut points [a,b,c,d] where higher = better. */
function bandUp(x: number, cuts: [number, number, number, number]): number {
  if (x < cuts[0]) return -2;
  if (x < cuts[1]) return -1;
  if (x <= cuts[2]) return 0;
  if (x <= cuts[3]) return 1;
  return 2;
}
/** Lower = better (e.g. concentration). Cuts descending [a,b,c,d]. */
function bandDown(x: number, cuts: [number, number, number, number]): number {
  if (x > cuts[0]) return -2;
  if (x > cuts[1]) return -1;
  if (x >= cuts[2]) return 0;
  if (x >= cuts[3]) return 1;
  return 2;
}

export const SCORERS: Record<FactorId, (i: FactorInputs) => Scored> = {
  owner: ({ r }) => {
    let role = r.owner_role;
    let derived = '';
    if (!role && r.owner_hours_per_week !== undefined) {
      role = r.owner_hours_per_week >= 45 ? 'on_tools' : r.owner_hours_per_week <= 15 ? 'absentee' : 'manager';
      derived = ` (role inferred from ${r.owner_hours_per_week} hrs/wk)`;
    }
    const sops = r.sops_documented === true;
    if (r.has_manager || role === 'absentee') {
      return { score: sops ? 2 : 1, reason: `${r.has_manager ? 'Manager in place' : 'Absentee owner'}${derived}; SOPs ${sops ? 'documented' : 'not documented'}` };
    }
    if (role === 'manager') return { score: sops ? 1 : 0, reason: `Owner manages${derived}; SOPs ${sops ? 'documented' : 'partial or none'}` };
    if (role === 'on_tools') return { score: sops ? -1 : -2, reason: `Owner on tools${derived}, no manager; SOPs ${sops ? 'documented' : 'not documented'}` };
    return { score: null, reason: 'No owner role, hours or manager data' };
  },

  growth: ({ cagr, r }) => {
    const g = r.sde_cagr_3y ?? cagr;
    if (g === undefined) return { score: null, reason: 'Needs 2+ years of SDE or sde_cagr_3y' };
    return { score: bandUp(g, [-5, 0, 5, 15]), reason: `SDE CAGR ${pct(g)}${r.sde_cagr_3y === undefined ? ' (calculated)' : ''}` };
  },

  recurring: ({ r }) => {
    const x = r.recurring_revenue_pct;
    if (x === undefined) return { score: null, reason: 'No recurring_revenue_pct' };
    let s = bandUp(x, [10, 25, 50, 75]);
    let note = '';
    if (s === 2 && (r.avg_contract_term_months ?? 0) < 12) {
      s = 1;
      note = r.avg_contract_term_months === undefined ? '; contract term unknown, capped at +1' : `; contracts ${r.avg_contract_term_months} months, capped at +1`;
    }
    return { score: s, reason: `${pct(x)} recurring${note}` };
  },

  concentration: ({ r }) => {
    if (r.top_customer_pct !== undefined) {
      return { score: bandDown(r.top_customer_pct, [30, 20, 10, 5]), reason: `Top customer ${pct(r.top_customer_pct)} of revenue` };
    }
    if (r.top5_customers_pct !== undefined) {
      const x = r.top5_customers_pct;
      return { score: x > 60 ? -1 : x < 25 ? 1 : 0, reason: `Top 5 customers ${pct(x)} (top customer unknown, ±1 max)` };
    }
    return { score: null, reason: 'No customer concentration data' };
  },

  lease: ({ r }) => {
    if (r.freehold_included) return { score: 2, reason: 'Freehold included: no lease risk' };
    if (r.lease_years_remaining === undefined) return { score: null, reason: 'No lease data' };
    const opt = r.lease_options_years ?? 0;
    const total = r.lease_years_remaining + opt;
    const rent = r.rent_pct_revenue;
    let s: number;
    if (total < 1) s = -2;
    else if (total < 2) s = -1;
    else if (total <= 3) s = 0;
    else if (total < 5) s = 1;
    else s = opt > 0 && rent !== undefined && rent < 10 ? 2 : 1;
    const rentNote = rent !== undefined ? `, rent ${pct(rent)} of revenue` : '';
    return { score: s, reason: `${r.lease_years_remaining} yrs + ${opt} option yrs = ${total} yrs${rentNote}` };
  },

  size: ({ weightedSde }) => {
    const x = weightedSde;
    const s = x < 100_000 ? -2 : x <= 500_000 ? 0 : x <= 1_000_000 ? 1 : 2;
    return { score: s, reason: `Weighted SDE $${Math.round(x).toLocaleString('en-AU')}` };
  },

  legal: ({ r }) => {
    if (!r.legal_issues) return { score: null, reason: 'No legal_issues data' };
    const s = r.legal_issues === 'material' ? -2 : r.legal_issues === 'minor' ? -1 : 0;
    return { score: s, reason: `Legal issues: ${r.legal_issues}` };
  },

  records: ({ r }) => {
    const q = r.financials_quality;
    const v = r.addbacks_verified_pct;
    const vNote = v !== undefined ? `, ${pct(v)} add-backs verified` : '';
    if (q === 'accountant_prepared') return { score: v !== undefined && v >= 90 ? 2 : 1, reason: `Accountant-prepared${vNote}` };
    if (q === 'bas_only') return { score: 0, reason: `BAS only${vNote}` };
    if (q === 'owner_prepared') return { score: v === undefined || v < 50 ? -2 : -1, reason: `Owner-prepared${vNote}` };
    if (v !== undefined) return { score: v >= 90 ? 1 : v < 50 ? -1 : 0, reason: `Quality unknown${vNote}` };
    return { score: null, reason: 'No financials_quality or verification data' };
  },

  outlook: ({ r }) => {
    const o = r.industry_outlook;
    const h = r.capacity_headroom;
    if (!o) return { score: null, reason: 'No industry_outlook' };
    let s = 0;
    if (o === 'growing') s = h === 'high' ? 2 : 1;
    if (o === 'declining') s = h === 'none' ? -2 : -1;
    return { score: s, reason: `${o[0].toUpperCase()}${o.slice(1)} sector${h ? `, ${h} headroom` : ''}` };
  },

  location: ({ r, tier }) => {
    const g = r.local_population_growth_pct;
    if (!tier && g === undefined) return { score: null, reason: 'No location tier, postcode or population data' };
    const t = tier === 'metro_cbd' || tier === 'metro' ? 1 : tier === 'regional' || tier === 'remote' ? -1 : 0;
    const p = g === undefined ? 0 : g > 2 ? 1 : g < 0 ? -1 : 0;
    return { score: clampScore(t + p), reason: `${tier ?? 'tier unknown'}${r.location_tier ? '' : tier ? ' (from postcode)' : ''}${g !== undefined ? `, population ${pct(g)}` : ''}` };
  },

  staff: ({ r }) => {
    if (r.staff_turnover === 'high') return { score: -2, reason: 'High turnover: key staff likely to leave' };
    if (r.has_manager === undefined && r.fte_count === undefined && !r.staff_turnover) return { score: null, reason: 'No staff data' };
    const fte = r.fte_count ?? 0;
    let s = 0;
    if (r.has_manager && (fte >= 5 || r.licences_transferable)) s = 2;
    else if (r.has_manager) s = 1;
    else if (fte < 2 && r.fte_count !== undefined) s = -1;
    if (r.staff_turnover === 'low' && s < 2) s += 1;
    return { score: clampScore(s), reason: `${r.has_manager ? 'Second-in-charge' : 'No manager'}${r.fte_count !== undefined ? `, ${fte} FTE` : ''}${r.staff_turnover ? `, ${r.staff_turnover} turnover` : ''}` };
  },

  supplier: ({ r }) => {
    const x = r.top_supplier_pct;
    if (x === undefined) return { score: null, reason: 'No top_supplier_pct' };
    return { score: bandDown(x, [70, 50, 30, 15]), reason: `Top supplier ${pct(x)} of purchases` };
  },

  assets: ({ r, fvEstimate }) => {
    const d = r.deferred_capex ?? 0;
    if (d > 0 && fvEstimate > 0) {
      const share = (d / fvEstimate) * 100;
      if (share > 10) return { score: -2, reason: `Deferred capex ${pct(share)} of FV` };
      if (share > 5) return { score: -1, reason: `Deferred capex ${pct(share)} of FV` };
    }
    if (r.asset_condition === 'renewed') return { score: 2, reason: 'Recently renewed' };
    if (r.asset_condition === 'worn') return { score: -1, reason: 'Worn assets' };
    if (r.asset_condition === 'normal' || r.deferred_capex !== undefined) return { score: 0, reason: 'Normal wear' };
    return { score: null, reason: 'No asset condition or deferred capex data' };
  },
};
