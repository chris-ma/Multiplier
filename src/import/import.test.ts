import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS as S } from '../engine/settings';
import { parseJsonFile } from './json';
import { parseDate, parseNumber } from './parse';
import { autoMap, errorsCsv, parseCsvText, validateRows } from './validate';
import { csvTemplate, jsonTemplate } from './templates';

const SPEC_CSV = `record_id,business_name,status,industry_code,state,postcode,asking_price,sale_price,revenue_y1,net_profit_y1,owner_wage_y1,revenue_y2,net_profit_y2,owner_wage_y2,recurring_revenue_pct,top_customer_pct,owner_role,lease_years_remaining,lease_options_years,location_dependent
BX-0001,Harbourside Cafe,listed,H4511,NSW,2000,520000,,910000,62000,95000,880000,58000,95000,0,2,on_tools,3,5,true
BX-0002,Northside Commercial Cleaning,sold,N7311,NSW,2065,,610000,1450000,118000,110000,1320000,104000,105000,82,18,manager,,,false
BX-0003,Coastal Plumbing Services,listed,E3231,QLD,4217,1150000,,2300000,240000,130000,2050000,205000,125000,55,9,manager,4,5,false`;

const run = (csv: string) => {
  const p = parseCsvText(csv);
  return validateRows(p.rows, autoMap(p.headers), S);
};

describe('parsers', () => {
  it('numbers accept $, commas and k/m suffixes', () => {
    expect(parseNumber('$520,000')).toBe(520000);
    expect(parseNumber('1.15m')).toBe(1150000);
    expect(parseNumber('95k')).toBe(95000);
    expect(parseNumber('POA')).toBeNaN();
  });
  it('dates accept ISO or DD/MM/YYYY', () => {
    expect(parseDate('2026-11-11')).toBe('2026-11-11');
    expect(parseDate('11/11/2026')).toBe('2026-11-11');
    expect(parseDate('31/02/2026')).toBeUndefined();
  });
});

describe('spec CSV sample', () => {
  it('imports all three rows', () => {
    const rows = run(SPEC_CSV);
    expect(rows.map((r) => r.status === 'rejected')).toEqual([false, false, false]);
    expect(rows[1].valuation?.priceKind).toBe('sale');
  });
});

describe('validation rules (spec §6)', () => {
  const head = 'record_id,business_name,status,industry_code,state,asking_price,sale_price,revenue_y1,net_profit_y1,owner_wage_y1,top_customer_pct';
  const row = (o: string) => run(`${head}\n${o}`)[0];
  it('required field missing → reject', () => {
    expect(row('A,X,listed,H4511,NSW,500000,,,60000,90000,').status).toBe('rejected');
  });
  it('"POA" → reject', () => {
    const r = row('A,X,listed,H4511,NSW,POA,,900000,60000,90000,');
    expect(r.status).toBe('rejected');
    expect(r.issues[0].field).toBe('asking_price');
  });
  it('unknown enum → reject with suggestion', () => {
    const r = row('A,X,for sale,H4511,NSW,500000,,900000,60000,90000,');
    expect(r.status).toBe('rejected');
    expect(r.issues[0].suggestion).toBe('listed');
  });
  it('percentage outside 0–100 → reject', () => {
    expect(row('A,X,listed,H4511,NSW,500000,,900000,60000,90000,140').status).toBe('rejected');
  });
  it('net profit above revenue → reject', () => {
    expect(row('A,X,listed,H4511,NSW,500000,,50000,60000,90000,').status).toBe('rejected');
  });
  it('sold without sale_price → reject', () => {
    expect(row('A,X,sold,H4511,NSW,,,900000,60000,90000,').issues[0].message).toMatch(/sale_price/);
  });
  it('implied multiple outside 0.5x–8x → warn', () => {
    expect(row('A,X,listed,H4511,NSW,5000000,,900000,60000,90000,').status).toBe('warning');
  });
  it('SDE margin over 60% → warn', () => {
    expect(row('A,X,listed,H4511,NSW,500000,,200000,150000,0,').status).toBe('warning');
  });
  it('duplicate record_id → reject second', () => {
    const rows = run(`${head}\nA,X,listed,H4511,NSW,500000,,900000,60000,90000,\nA,Y,listed,H4511,NSW,500000,,900000,60000,90000,`);
    expect(rows.map((r) => r.status)).toEqual(['valid', 'rejected']);
    expect(errorsCsv(rows)).toMatch(/error/);
  });
});

describe('JSON', () => {
  it('flattens the spec sample, itemised add-backs and verified share', () => {
    const { rows, error } = parseJsonFile(jsonTemplate());
    expect(error).toBeUndefined();
    const res = validateRows(rows, null, S)[0];
    expect(res.status).not.toBe('rejected');
    expect(res.record).toMatchObject({ asking_price: 520000, state: 'NSW', addbacks_y1: 23000, negative_adjustments_y1: 22000, lease_years_remaining: 3, owner_role: 'on_tools' });
    expect(res.record!.addbacks_verified_pct).toBeCloseTo(60.9);
    expect(res.valuation!.sde.weighted).toBe(62000 + 95000 + 23000 - 22000);
  });
});

describe('templates', () => {
  it('CSV template round-trips through validation', () => {
    const rows = run(csvTemplate());
    expect(rows[0].status).not.toBe('rejected');
  });
});
