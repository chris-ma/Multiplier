import { describe, expect, it } from 'vitest';
import { FACTORS, type FactorId } from './factors';
import { tierFromPostcode } from './location';
import { sectorFor } from './sectors';
import { weightSde } from './sde';
import { DEFAULT_SETTINGS as S } from './settings';
import type { BizRecord } from './types';
import { annualPayment, buildComps, value, verdictFor } from './value';

const base = (o: Partial<BizRecord> = {}): BizRecord => ({
  record_id: 'T-1', business_name: 'Test', status: 'listed', industry_code: 'H4511', state: 'NSW',
  asking_price: 500000, revenue_y1: 900000, net_profit_y1: 80000, owner_wage_y1: 100000, ...o,
});

const zeroAll = (except: Partial<Record<FactorId, number>> = {}) =>
  Object.fromEntries(FACTORS.map((f) => [f.id, except[f.id] ?? 0])) as Record<FactorId, number>;

describe('spec §5 worked example: Sydney metro café', () => {
  it('SDE 180k, base 2.0x, factors +0.35 → FV $423k, ±15%, P/FV 1.23 well above, confirmed', () => {
    // 10 optional fields → partial band (±15%)
    const r = base({
      net_profit_y1: 85000, owner_wage_y1: 95000, asking_price: 520000, postcode: '2010',
      lease_years_remaining: 3, lease_options_years: 5, rent_pct_revenue: 8, recurring_revenue_pct: 0,
      top_customer_pct: 2, owner_role: 'on_tools', has_manager: false, sops_documented: false,
    });
    const v = value(r, S, { scoreOverrides: zeroAll({ lease: 2 }) });
    expect(v.sde.weighted).toBe(180000);
    expect(v.baseMultiple).toBe(2.0);
    expect(v.factorTurns).toBeCloseTo(0.35);
    expect(v.adjustedMultiple).toBeCloseTo(2.35);
    expect(v.fvPoint).toBeCloseTo(423000);
    expect(v.bandPct).toBe(0.15);
    expect(v.fvLow).toBeCloseTo(359550);
    expect(v.fvHigh).toBeCloseTo(486450);
    expect(v.pfv).toBeCloseTo(1.229, 3);
    expect(v.verdict).toBe('well_above');
    expect(v.confirmed).toBe(true);
    expect(v.expectedSale).toBeCloseTo(478400);
  });
});

describe('SDE normalisation and weighting', () => {
  it('normalises: + owner wage + add-backs − negatives − maintenance capex', () => {
    const r = base({ addbacks_y1: 23000, negative_adjustments_y1: -22000, maintenance_capex: 5000 });
    expect(weightSde(r, S).weighted).toBe(80000 + 100000 + 23000 - 22000 - 5000);
  });
  it('rising → 50/30/20', () => {
    const r = base({ net_profit_y1: 300, owner_wage_y1: 0, net_profit_y2: 200, owner_wage_y2: 0, net_profit_y3: 100, owner_wage_y3: 0 });
    const w = weightSde(r, S);
    expect(w.rule).toBe('rising');
    expect(w.weighted).toBeCloseTo(300 * 0.5 + 200 * 0.3 + 100 * 0.2);
  });
  it('falling → latest × 0.9', () => {
    const r = base({ net_profit_y1: 100, owner_wage_y1: 0, net_profit_y2: 200, owner_wage_y2: 0, net_profit_y3: 300, owner_wage_y3: 0 });
    const w = weightSde(r, S);
    expect(w.rule).toBe('falling');
    expect(w.weighted).toBeCloseTo(90);
  });
  it('volatile → equal thirds, or drop the documented abnormal year', () => {
    const r = base({ net_profit_y1: 300, owner_wage_y1: 0, net_profit_y2: 100, owner_wage_y2: 0, net_profit_y3: 200, owner_wage_y3: 0 });
    expect(weightSde(r, S).weighted).toBeCloseTo(200);
    expect(weightSde({ ...r, abnormal_year: 2 }, S).weighted).toBeCloseTo(250);
  });
});

describe('factors, clamp and overrides', () => {
  it('max swings sum to +3.5 / −3.8 turns', () => {
    const up = FACTORS.filter((f) => !f.noUpside).reduce((a, f) => a + f.swing, 0);
    const down = FACTORS.reduce((a, f) => a + f.swing, 0);
    expect(up).toBeCloseTo(3.5);
    expect(down).toBeCloseTo(3.8);
  });
  it('legal has no upside', () => {
    const v = value(base(), S, { scoreOverrides: zeroAll({ legal: 2 }) });
    expect(v.factors.find((f) => f.id === 'legal')!.contribution).toBe(0);
  });
  it('clamps to industry range ± 0.5x', () => {
    const all2 = Object.fromEntries(FACTORS.map((f) => [f.id, 2]));
    const v = value(base(), S, { scoreOverrides: all2 });
    expect(v.rawMultiple).toBeCloseTo(5.5);
    expect(v.adjustedMultiple).toBe(3.0); // hospitality max 2.5 + 0.5
    const allm2 = Object.fromEntries(FACTORS.map((f) => [f.id, -2]));
    expect(value(base(), S, { scoreOverrides: allm2 }).adjustedMultiple).toBe(1.0);
  });
  it('location-dependent with lease under 1 year caps at industry minimum', () => {
    const v = value(base({ location_dependent: true, lease_years_remaining: 0.5 }), S, { scoreOverrides: zeroAll() });
    expect(v.adjustedMultiple).toBe(1.5);
    expect(v.overrideNotes.length).toBe(1);
  });
  it('material legal issue → requires review, ±25%', () => {
    const v = value(base({ legal_issues: 'material' }), S);
    expect(v.requiresReview).toBe(true);
    expect(v.bandPct).toBe(0.25);
  });
  it('scores thresholds from data', () => {
    const v = value(base({
      owner_role: 'absentee', sops_documented: true, top_customer_pct: 35, recurring_revenue_pct: 80, avg_contract_term_months: 24,
      top_supplier_pct: 10, financials_quality: 'accountant_prepared', addbacks_verified_pct: 95,
    }), S);
    const sc = Object.fromEntries(v.factors.map((f) => [f.id, f.score]));
    expect(sc).toMatchObject({ owner: 2, concentration: -2, recurring: 2, supplier: 2, records: 2, size: 0, growth: null });
  });
});

describe('verdicts, DSCR, loss-making, comparables', () => {
  it('verdict bands', () => {
    expect(verdictFor(0.84)).toBe('well_below');
    expect(verdictFor(0.9)).toBe('below');
    expect(verdictFor(0.95)).toBe('fair');
    expect(verdictFor(1.05)).toBe('fair');
    expect(verdictFor(1.1)).toBe('above');
    expect(verdictFor(1.2)).toBe('well_above');
  });
  it('unconfirmed verdict when price sits inside the confidence range', () => {
    const v = value(base({ asking_price: 400000 }), S, { scoreOverrides: zeroAll() }); // FV 360k, ±20% → 288–432k; P/FV 1.11
    expect(v.verdict).toBe('above');
    expect(v.confirmed).toBe(false);
  });
  it('flags unfinanceable at asking when DSCR < 1.25', () => {
    const v = value(base({ asking_price: 2_000_000 }), S);
    expect(v.unfinanceable).toBe(true);
    expect(annualPayment(100000, 0, 5)).toBe(20000);
  });
  it('loss-making → asset value with zero goodwill', () => {
    const v = value(base({ net_profit_y1: -200000, owner_wage_y1: 50000, plant_equipment_value: 40000 }), S);
    expect(v.lossMaking).toBe(true);
    expect(v.fvPoint).toBe(40000);
  });
  it('sold comparables replace the base multiple once a sector has 10+', () => {
    const sold = Array.from({ length: 10 }, (_, i) => base({ record_id: `S${i}`, status: 'sold', asking_price: undefined, sale_price: 180000 * (2.2 + i * 0.02) }));
    const comps = buildComps(sold, S);
    expect(comps.hospitality.count).toBe(10);
    const v = value(base(), S, { comps });
    expect(v.baseSource).toBe('comparables');
    expect(v.baseMultiple).toBeCloseTo(2.29);
  });
});

describe('reference mappings', () => {
  it('maps ANZSIC codes to sectors', () => {
    expect(sectorFor('H4511').id).toBe('hospitality');
    expect(sectorFor('N7311').id).toBe('cleaning');
    expect(sectorFor('E3231').id).toBe('plumbing');
    expect(sectorFor('Q8710').id).toBe('childcare');
    expect(sectorFor('M6932').id).toBe('other');
  });
  it('derives location tier from postcode', () => {
    expect(tierFromPostcode('2000')).toBe('metro_cbd');
    expect(tierFromPostcode('2065')).toBe('metro');
    expect(tierFromPostcode('4217')).toBe('regional_city');
    expect(tierFromPostcode('2650')).toBe('regional');
    expect(tierFromPostcode('0870')).toBe('remote');
  });
});
