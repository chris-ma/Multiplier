import { describe, expect, it } from 'vitest';
import { maxFinanceablePrice, niceRound, pricingPlan, readListPrice } from './sell';
import { DEFAULT_SETTINGS as S } from './settings';
import type { BizRecord } from './types';
import { annualPayment } from './value';

const biz = (o: Partial<BizRecord> = {}): BizRecord => ({
  record_id: 'SELL-1', business_name: 'My Cafe', status: 'listed', industry_code: 'H4511', state: 'NSW',
  revenue_y1: 1_200_000, net_profit_y1: 160_000, owner_wage_y1: 90_000, ...o,
});

describe('sell-side pricing', () => {
  it('rounds list prices to advertised steps', () => {
    expect(niceRound(187_400)).toBe(185_000);
    expect(niceRound(423_000)).toBe(420_000);
    expect(niceRound(1_237_000)).toBe(1_225_000);
    expect(niceRound(449_999, 'down')).toBe(440_000);
  });

  it('max financeable price clears DSCR exactly at the limit', () => {
    const p = maxFinanceablePrice(250_000, S);
    const pay = annualPayment(p * (1 - S.buyerEquityPct / 100), S.loanRatePct, S.loanTermYears);
    expect((250_000 - S.marketOwnerWage) / pay).toBeCloseTo(S.dscrMin, 6);
    expect(maxFinanceablePrice(80_000, S)).toBe(0);
  });

  it('market list price ≈ FV ÷ sale-to-asking; stretch never reads well above fair value', () => {
    const plan = pricingPlan(biz(), S);
    const P = plan.fv.fvPoint;
    const [quick, market, stretch] = plan.strategies;
    expect(quick.listPrice).toBe(niceRound(P));
    expect(market.listPrice).toBe(niceRound(P / S.saleToAsking));
    expect(stretch.pfv).toBeLessThanOrEqual(1.15);
    expect(stretch.verdict).toBe('above');
    expect(stretch.listPrice).toBeGreaterThan(market.listPrice);
    expect(market.listPrice).toBeGreaterThan(quick.listPrice);
    expect(plan.fv.price).toBeUndefined();
  });

  it('caps the recommendation at the financeable price when bank debt cannot fund it', () => {
    // High FV relative to SDE (childcare multiples) with thin cover after owner wage.
    const plan = pricingPlan(biz({ industry_code: 'Q8710', net_profit_y1: 60_000, owner_wage_y1: 90_000 }), S);
    const m = plan.strategies.find((x) => x.id === plan.recommended)!;
    if (plan.maxFinanceable >= plan.fv.fvPoint * 0.9) expect(m.listPrice).toBeLessThanOrEqual(plan.maxFinanceable);
    else expect(plan.recommendedReason).toMatch(/vendor finance/);
  });

  it('ranks value drivers by fair value uplift', () => {
    const plan = pricingPlan(biz({ owner_role: 'on_tools', has_manager: false, sops_documented: false, lease_years_remaining: 1 }), S);
    expect(plan.drivers.length).toBeGreaterThan(0);
    for (let i = 1; i < plan.drivers.length; i++) expect(plan.drivers[i - 1].uplift).toBeGreaterThanOrEqual(plan.drivers[i].uplift);
    const owner = plan.drivers.find((d) => d.factorId === 'owner')!;
    expect(owner.uplift).toBeGreaterThan(0);
  });

  it('values unverified add-backs at risk', () => {
    const plan = pricingPlan(biz({ addbacks_y1: 40_000, addbacks_verified_pct: 50 }), S);
    expect(plan.unverifiedAtRisk).toBeCloseTo(20_000 * plan.fv.adjustedMultiple, -2);
  });

  it('reads a chosen list price the way a buyer screen would', () => {
    const r = biz();
    const plan = pricingPlan(r, S);
    const read = readListPrice(plan, plan.fv.fvPoint * 1.3, S, r);
    expect(read.verdict).toBe('well_above');
  });
});
