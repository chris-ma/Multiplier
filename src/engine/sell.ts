import { FACTORS, type FactorId } from './factors';
import type { Settings } from './settings';
import type { BizRecord } from './types';
import { annualPayment, value, verdictFor, type CompsContext, type ValuationResult, type VerdictId } from './value';

/**
 * Sell side: turn the same fair-value model into a recommended list price.
 *
 * Logic: buyers screen listings on P/FV and negotiate down by the sale-to-asking
 * ratio (default 0.92). A seller who wants to realise fair value therefore lists
 * at FV ÷ ratio, capped so the listing never reads "well above fair value"
 * (P/FV > 1.15) or above the top of the confidence range.
 */

export type StrategyId = 'quick' | 'market' | 'stretch';

export interface Strategy {
  id: StrategyId;
  label: string;
  description: string;
  listPrice: number;
  expectedSale: number;
  pfv: number;
  verdict: VerdictId;
  financeable: boolean;
  dscr?: number;
}

export interface Driver {
  factorId: FactorId;
  num: number;
  name: string;
  score: number | null;
  /** Fair value gained if this factor reached its best realistic score. */
  uplift: number;
  target: number;
  action: string;
  missingData: boolean;
}

export interface PricingPlan {
  fv: ValuationResult;
  strategies: Strategy[];
  recommended: StrategyId;
  recommendedReason: string;
  /** Highest price at which bank debt still clears the DSCR test; undefined if no positive cover. */
  maxFinanceable: number;
  /** FV lost if a buyer's accountant strips add-backs without documentary proof. */
  unverifiedAtRisk: number;
  addbacksVerifiedKnown: boolean;
  drivers: Driver[];
}

export const ACTIONS: Record<FactorId, string> = {
  owner: 'Appoint a second-in-charge and document SOPs so the business runs without you.',
  growth: 'Show a consistent upward SDE trend; avoid listing straight after a down year.',
  recurring: 'Move regular customers onto contracts or subscriptions of 12 months or more.',
  concentration: 'Bring your largest customer below 10% of revenue, or lock it in on a transferable contract.',
  lease: 'Negotiate a lease extension or options before listing; buyers want 3–5 years plus options.',
  size: 'Size is structural: only growing SDE moves you into a higher band.',
  legal: 'Resolve disputes and compliance gaps before going to market.',
  records: 'Have an accountant prepare 3 years of financials matching lodged tax returns, with evidence for every add-back.',
  outlook: 'Document spare capacity: how revenue can grow without new capex.',
  location: 'Largely structural; show local population and demand data in your information memorandum.',
  staff: 'Retain key staff (consider incentives tied to the sale) and build depth below you.',
  supplier: 'Line up alternative suppliers and document terms.',
  assets: 'Complete deferred maintenance, or disclose it: buyers deduct deferred capex in full.',
};

/** Round a list price to a figure a broker would actually advertise. */
export function niceRound(x: number, dir: 'nearest' | 'down' = 'nearest'): number {
  const step = x < 200_000 ? 5_000 : x < 1_000_000 ? 10_000 : x < 5_000_000 ? 25_000 : 50_000;
  const f = dir === 'down' ? Math.floor : Math.round;
  return Math.max(step, f(x / step) * step);
}

/** Highest asking price whose bank debt still clears the lender DSCR test. */
export function maxFinanceablePrice(weightedSde: number, s: Settings, r?: BizRecord): number {
  const cover = weightedSde - s.marketOwnerWage;
  if (cover <= 0) return 0;
  const maxPayment = cover / s.dscrMin;
  const rate = (r?.loan_rate_pct ?? s.loanRatePct) / 100;
  const n = r?.loan_term_years ?? s.loanTermYears;
  const principal = rate === 0 ? maxPayment * n : (maxPayment * (1 - Math.pow(1 + rate, -n))) / rate;
  const debtShare = Math.max(0.01, 1 - s.buyerEquityPct / 100 - (r?.earnout_pct ?? 0) / 100);
  return principal / debtShare;
}

function dscrAt(price: number, weightedSde: number, s: Settings, r: BizRecord): number | undefined {
  const debtShare = Math.max(0, 1 - s.buyerEquityPct / 100 - (r.earnout_pct ?? 0) / 100);
  const pay = annualPayment(price * debtShare, r.loan_rate_pct ?? s.loanRatePct, r.loan_term_years ?? s.loanTermYears);
  return pay > 0 ? (weightedSde - s.marketOwnerWage) / pay : undefined;
}

export function pricingPlan(input: BizRecord, s: Settings, comps?: CompsContext): PricingPlan {
  const r: BizRecord = { ...input, asking_price: undefined, sale_price: undefined, status: 'listed' };
  const fv = value(r, s, { comps });
  const P = fv.fvPoint;
  const W = fv.sde.weighted;
  const maxFin = maxFinanceablePrice(W, s, r);

  const mk = (id: StrategyId, label: string, description: string, raw: number): Strategy => {
    const listPrice = niceRound(raw);
    const pfv = P > 0 ? listPrice / P : NaN;
    const dscr = dscrAt(listPrice, W, s, r);
    return {
      id, label, description, listPrice,
      expectedSale: listPrice * s.saleToAsking,
      pfv,
      verdict: verdictFor(pfv),
      financeable: dscr !== undefined && dscr >= s.dscrMin,
      dscr,
    };
  };

  // Ceiling: P/FV 1.15, the top of "Above fair value". Beyond it buyers read "Unlikely to sell at asking".
  const ceiling = P * 1.15;
  const strategies: Strategy[] = [
    mk('quick', 'Quick sale', 'List at fair value. Reads as fairly priced to buyers; expect offers below fair value.', P),
    mk('market', 'Market', `List high enough that a typical ${Math.round((1 - s.saleToAsking) * 100)}% negotiation lands near fair value.`, Math.min(P / s.saleToAsking, ceiling)),
  ];
  const stretch = mk('stretch', 'Stretch', 'Highest price that still reads "Above fair value" rather than "Well above". Longer time on market; expect hard negotiation.', ceiling);
  stretch.listPrice = niceRound(ceiling, 'down');
  stretch.pfv = stretch.listPrice / P;
  stretch.verdict = verdictFor(stretch.pfv);
  stretch.expectedSale = stretch.listPrice * s.saleToAsking;
  stretch.dscr = dscrAt(stretch.listPrice, W, s, r);
  stretch.financeable = stretch.dscr !== undefined && stretch.dscr >= s.dscrMin;
  if (stretch.listPrice > strategies[1].listPrice) strategies.push(stretch);

  let recommended: StrategyId = 'market';
  let recommendedReason = 'Lands near fair value after normal negotiation, without reading as overpriced.';
  const market = strategies[1];
  if (!market.financeable) {
    if (maxFin >= P * 0.9) {
      const fin = mk('market', 'Bank-fundable', 'Highest price a bank will lend against at your earnings, so most buyers can fund it without vendor finance.', Math.min(maxFin, market.listPrice));
      fin.listPrice = niceRound(Math.min(maxFin, market.listPrice), 'down');
      fin.pfv = fin.listPrice / P;
      fin.verdict = verdictFor(fin.pfv);
      fin.expectedSale = fin.listPrice * s.saleToAsking;
      fin.dscr = dscrAt(fin.listPrice, W, s, r);
      fin.financeable = fin.dscr !== undefined && fin.dscr >= s.dscrMin;
      strategies[1] = fin;
      recommendedReason = 'Capped at the highest price a bank will lend against, so buyers can fund it without vendor finance.';
    } else {
      recommendedReason = 'Bank debt alone cannot fund fair value at your earnings: expect to offer vendor finance or an earn-out.';
    }
  }

  strategies.sort((a, b) => a.listPrice - b.listPrice);

  // Value drivers: what each factor would add if it reached its best realistic score.
  const drivers: Driver[] = [];
  for (const f of fv.factors) {
    const def = FACTORS.find((d) => d.id === f.id)!;
    const target = def.noUpside ? 0 : 2;
    const missingData = f.score === null;
    if (!missingData && f.score! >= target) continue;
    const better = value(r, s, { comps, scoreOverrides: { [f.id]: target } });
    const uplift = better.fvPoint - (missingData ? value(r, s, { comps, scoreOverrides: { [f.id]: 0 } }).fvPoint : P);
    if (uplift <= 0 && !missingData) continue;
    drivers.push({ factorId: f.id, num: f.num, name: f.name, score: f.score, uplift: Math.max(0, uplift), target, action: ACTIONS[f.id], missingData });
  }
  drivers.sort((a, b) => b.uplift - a.uplift);

  // Unverified add-backs at risk.
  const vPct = r.addbacks_verified_pct;
  const keep = (vPct ?? 0) / 100;
  const stripped: BizRecord = {
    ...r,
    addbacks_y1: r.addbacks_y1 !== undefined ? r.addbacks_y1 * keep : undefined,
    addbacks_y2: r.addbacks_y2 !== undefined ? r.addbacks_y2 * keep : undefined,
    addbacks_y3: r.addbacks_y3 !== undefined ? r.addbacks_y3 * keep : undefined,
  };
  const unverifiedAtRisk = Math.max(0, P - value(stripped, s, { comps }).fvPoint);

  return { fv, strategies, recommended, recommendedReason, maxFinanceable: maxFin, unverifiedAtRisk, addbacksVerifiedKnown: vPct !== undefined, drivers };
}

/** How a buyer's screen would read a chosen list price. */
export function readListPrice(plan: PricingPlan, listPrice: number, s: Settings, r: BizRecord) {
  const P = plan.fv.fvPoint;
  const pfv = P > 0 ? listPrice / P : NaN;
  const dscr = dscrAt(listPrice, plan.fv.sde.weighted, s, r);
  return {
    pfv,
    verdict: verdictFor(pfv),
    confirmed: listPrice > plan.fv.fvHigh || listPrice < plan.fv.fvLow,
    expectedSale: listPrice * s.saleToAsking,
    dscr,
    financeable: dscr !== undefined && dscr >= s.dscrMin,
  };
}
