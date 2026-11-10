import { FACTORS, SCORERS, type FactorDef, type FactorId } from './factors';
import { OPTIONAL_KEYS, REQUIRED_KEYS } from './fields';
import { tierFromPostcode } from './location';
import { sectorFor, type Sector } from './sectors';
import { sdeCagr, weightSde, type WeightedSde } from './sde';
import type { Settings } from './settings';
import type { BizRecord } from './types';

export type VerdictId = 'well_below' | 'below' | 'fair' | 'above' | 'well_above';

export const VERDICTS: { id: VerdictId; label: string; from: number; to: number; reading: string }[] = [
  { id: 'well_below', label: 'Well below fair value', from: -Infinity, to: 0.85, reading: 'Investigate why: often a hidden problem' },
  { id: 'below', label: 'Below fair value', from: 0.85, to: 0.95, reading: 'Negotiating room favours buyer' },
  { id: 'fair', label: 'Fair', from: 0.95, to: 1.05, reading: 'Within normal negotiating range' },
  { id: 'above', label: 'Above fair value', from: 1.05, to: 1.15, reading: 'Expect negotiation down' },
  { id: 'well_above', label: 'Well above fair value', from: 1.15, to: Infinity, reading: 'Unlikely to sell at asking' },
];

export function verdictFor(pfv: number): VerdictId {
  if (pfv < 0.85) return 'well_below';
  if (pfv < 0.95) return 'below';
  if (pfv <= 1.05) return 'fair';
  if (pfv <= 1.15) return 'above';
  return 'well_above';
}

export interface FactorResult extends FactorDef {
  w: number;
  score: number | null;
  /** True when the score came from a user slider rather than data. */
  overridden: boolean;
  contribution: number;
  reason: string;
}

/** Sector comparables: median sold multiple and count per sector id. */
export type CompsContext = Record<string, { median: number; count: number }>;

export interface ValuationResult {
  recordId: string;
  sector: Sector;
  sde: WeightedSde;
  earningsBasis: 'SDE' | 'EBITDA';
  lossMaking: boolean;
  baseMultiple: number;
  baseSource: 'benchmark' | 'comparables';
  compsCount: number;
  factors: FactorResult[];
  factorTurns: number;
  rawMultiple: number;
  clampLow: number;
  clampHigh: number;
  adjustedMultiple: number;
  clampNote?: string;
  overrideNotes: string[];
  inventory: number;
  excessAssets: number;
  deferredCapex: number;
  fvPoint: number;
  fvLow: number;
  fvHigh: number;
  bandPct: number;
  bandReason: string;
  price?: number;
  priceKind: 'asking' | 'sale' | 'none';
  pfv?: number;
  impliedMultiple?: number;
  verdict?: VerdictId;
  confirmed: boolean;
  expectedSale?: number;
  dscr?: number;
  annualDebtService?: number;
  unfinanceable: boolean;
  requiresReview: boolean;
  flags: string[];
  optionalPresent: number;
}

function isPresent(v: unknown): boolean {
  return v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && Number.isNaN(v));
}

/** Annual repayment on an amortising loan. */
export function annualPayment(principal: number, ratePct: number, years: number): number {
  if (principal <= 0) return 0;
  const r = ratePct / 100;
  if (r === 0) return principal / years;
  return (principal * r) / (1 - Math.pow(1 + r, -years));
}

export interface ValueOptions {
  comps?: CompsContext;
  scoreOverrides?: Partial<Record<FactorId, number>>;
}

/** The valuation engine. Pure and deterministic: same record + settings → same result. */
export function value(r: BizRecord, s: Settings, opts: ValueOptions = {}): ValuationResult {
  const sector = sectorFor(r.industry_code);
  const sde = weightSde(r, s);
  const W = sde.weighted;
  const flags: string[] = [];
  const overrideNotes: string[] = [];

  // Step 3: base multiple
  const comp = opts.comps?.[sector.id];
  const useComps = s.useComparables && comp !== undefined && comp.count >= s.minComps;
  const baseMultiple = useComps ? comp!.median : sector.base;

  // Step 4: factor scores
  const tier = r.location_tier ?? tierFromPostcode(r.postcode);
  const cagr = sdeCagr(sde.years);
  const inputs = { r, weightedSde: W, cagr, tier, fvEstimate: Math.max(W, 0) * baseMultiple };
  const factors: FactorResult[] = FACTORS.map((d) => {
    const scored = SCORERS[d.id](inputs);
    const ov = opts.scoreOverrides?.[d.id];
    let score = ov !== undefined ? ov : scored.score;
    if (score !== null && d.noUpside) score = Math.min(0, score);
    const w = d.swing / 2;
    return {
      ...d,
      w,
      score,
      overridden: ov !== undefined,
      contribution: score === null ? 0 : score * w,
      reason: ov !== undefined ? `Manual score (data: ${scored.score ?? 'n/a'}; ${scored.reason})` : scored.reason,
    };
  });
  const factorTurns = factors.reduce((a, f) => a + f.contribution, 0);
  const rawMultiple = baseMultiple + factorTurns;
  const clampLow = Math.max(0, sector.min - s.clampPad);
  const clampHigh = sector.max + s.clampPad;
  let adjustedMultiple = Math.min(clampHigh, Math.max(clampLow, rawMultiple));
  let clampNote: string | undefined;
  if (adjustedMultiple !== rawMultiple) clampNote = `Clamped to ${sector.label} range ±${s.clampPad}x (${clampLow.toFixed(2)}x–${clampHigh.toFixed(2)}x)`;

  // Hard overrides
  const leaseTotal = r.lease_years_remaining !== undefined ? r.lease_years_remaining + (r.lease_options_years ?? 0) : undefined;
  if (r.location_dependent && !r.freehold_included && leaseTotal !== undefined && leaseTotal < 1 && adjustedMultiple > sector.min) {
    adjustedMultiple = sector.min;
    overrideNotes.push(`Location-dependent with under 1 year of lease: multiple capped at industry minimum ${sector.min.toFixed(2)}x`);
  }
  const requiresReview = r.legal_issues === 'material';
  if (requiresReview) overrideNotes.push('Material legal issue: requires review, confidence band widened to ±25%');

  // Balance-sheet items
  const inventory = r.price_includes_stock ? r.stock_at_cost ?? 0 : 0;
  const excessAssets = (r.excess_assets ?? 0) + (r.freehold_included ? r.freehold_value ?? 0 : 0);
  const deferredCapex = r.deferred_capex ?? 0;
  if (r.freehold_included && r.freehold_value === undefined) flags.push('Freehold included but freehold_value missing: FV excludes the property');

  const lossMaking = W <= 0;
  let fvPoint: number;
  if (lossMaking) {
    fvPoint = Math.max(0, inventory + excessAssets + (r.plant_equipment_value ?? 0) - deferredCapex);
    flags.push('Loss-making: asset-based value with zero goodwill');
  } else {
    fvPoint = W * adjustedMultiple + inventory + excessAssets - deferredCapex;
  }

  // Confidence band
  const optionalPresent = OPTIONAL_KEYS.filter((k) => isPresent(r[k])).length;
  const requiredOk = REQUIRED_KEYS.every((k) => isPresent(r[k]));
  let bandPct: number;
  let bandReason: string;
  if (requiresReview) { bandPct = 0.25; bandReason = 'Legal review flag'; }
  else if (requiredOk && optionalPresent >= 20) { bandPct = 0.1; bandReason = `All required + ${optionalPresent} optional fields`; }
  else if (optionalPresent >= 8) { bandPct = 0.15; bandReason = `Partial data: ${optionalPresent} optional fields`; }
  else { bandPct = 0.2; bandReason = `Minimum data: ${optionalPresent} optional fields`; }
  const fvLow = fvPoint * (1 - bandPct);
  const fvHigh = fvPoint * (1 + bandPct);

  // Price and verdict
  const priceKind: ValuationResult['priceKind'] = r.status === 'sold' && r.sale_price !== undefined ? 'sale'
    : r.asking_price !== undefined ? 'asking'
    : r.sale_price !== undefined ? 'sale' : 'none';
  const price = priceKind === 'sale' ? r.sale_price : priceKind === 'asking' ? r.asking_price : undefined;
  let pfv: number | undefined;
  let verdict: VerdictId | undefined;
  let confirmed = false;
  if (price !== undefined && fvPoint > 0) {
    pfv = price / fvPoint;
    verdict = verdictFor(pfv);
    confirmed = price > fvHigh || price < fvLow;
  }
  const impliedMultiple = price !== undefined && W > 0 ? price / W : undefined;
  const expectedSale = r.asking_price !== undefined ? r.asking_price * s.saleToAsking : undefined;

  // Lender test: (SDE − market owner wage) ÷ annual debt service ≥ 1.25
  let dscr: number | undefined;
  let annualDebtService: number | undefined;
  let unfinanceable = false;
  if (r.asking_price !== undefined && r.status !== 'sold') {
    const debtShare = Math.max(0, 1 - s.buyerEquityPct / 100 - (r.earnout_pct ?? 0) / 100);
    const principal = r.asking_price * debtShare;
    annualDebtService = annualPayment(principal, r.loan_rate_pct ?? s.loanRatePct, r.loan_term_years ?? s.loanTermYears);
    const cover = W - s.marketOwnerWage;
    dscr = annualDebtService > 0 ? cover / annualDebtService : undefined;
    if (dscr !== undefined && dscr < s.dscrMin) {
      unfinanceable = true;
      flags.push(`Unfinanceable at asking: DSCR ${dscr.toFixed(2)} below ${s.dscrMin}`);
    }
  }

  if (r.licences_transferable === false) flags.push('Licences not transferable');
  if (impliedMultiple !== undefined && (impliedMultiple < 0.5 || impliedMultiple > 8)) flags.push(`Implied multiple ${impliedMultiple.toFixed(2)}x is outside 0.5x–8x`);
  const rev = r.revenue_y1;
  if (rev > 0 && sde.years[0] && sde.years[0].sde / rev > 0.6) flags.push('SDE margin over 60% of revenue: add-backs may be overstated');

  return {
    recordId: r.record_id,
    sector,
    sde,
    earningsBasis: r.owner_role === 'absentee' ? 'EBITDA' : 'SDE',
    lossMaking,
    baseMultiple,
    baseSource: useComps ? 'comparables' : 'benchmark',
    compsCount: comp?.count ?? 0,
    factors,
    factorTurns,
    rawMultiple,
    clampLow,
    clampHigh,
    adjustedMultiple,
    clampNote,
    overrideNotes,
    inventory,
    excessAssets,
    deferredCapex,
    fvPoint,
    fvLow,
    fvHigh,
    bandPct,
    bandReason,
    price,
    priceKind,
    pfv,
    impliedMultiple,
    verdict,
    confirmed,
    expectedSale,
    dscr,
    annualDebtService,
    unfinanceable,
    requiresReview,
    flags,
    optionalPresent,
  };
}

/** Median sold multiple (sale_price ÷ weighted SDE) per sector. */
export function buildComps(records: BizRecord[], s: Settings): CompsContext {
  const by: Record<string, number[]> = {};
  for (const r of records) {
    if (r.status !== 'sold' || r.sale_price === undefined) continue;
    const w = weightSde(r, s).weighted;
    if (w <= 0) continue;
    const id = sectorFor(r.industry_code).id;
    (by[id] ??= []).push(r.sale_price / w);
  }
  const out: CompsContext = {};
  for (const [id, xs] of Object.entries(by)) {
    xs.sort((a, b) => a - b);
    const m = xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
    out[id] = { median: m, count: xs.length };
  }
  return out;
}
