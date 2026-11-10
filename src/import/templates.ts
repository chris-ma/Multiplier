import Papa from 'papaparse';
import { FIELDS } from '../engine/fields';
import type { BizRecord } from '../engine/types';
import { JSON_SCHEMA_VERSION } from './schema';

/** CSV template generated from the live field registry, so headers cannot drift from the code. */
export function csvTemplate(): string {
  const headers = FIELDS.map((f) => f.key);
  const example: Record<string, string> = {
    record_id: 'BX-0001', business_name: 'Harbourside Cafe', status: 'listed', industry_code: 'H4511',
    asking_price: '520000', revenue_y1: '910000', net_profit_y1: '62000', owner_wage_y1: '95000',
    revenue_y2: '880000', net_profit_y2: '58000', owner_wage_y2: '95000', state: 'NSW', postcode: '2000',
    owner_role: 'on_tools', lease_years_remaining: '3', lease_options_years: '5', location_dependent: 'true',
  };
  return Papa.unparse({ fields: headers, data: [headers.map((h) => example[h] ?? '')] });
}

export function jsonTemplate(): string {
  return JSON.stringify({
    schema_version: JSON_SCHEMA_VERSION,
    currency: 'AUD',
    records: [{
      record_id: 'BX-0001',
      business_name: 'Harbourside Cafe',
      status: 'listed',
      industry_code: 'H4511',
      location: { state: 'NSW', postcode: '2000', location_tier: 'metro_cbd', location_dependent: true },
      price: { asking: 520000, includes_stock: false, stock_at_cost: 12000 },
      financials: [{
        year: 'FY2026', revenue: 910000, net_profit: 62000, owner_wage: 95000,
        addbacks: [
          { label: 'Owner vehicle lease', amount: 14000, verified: true },
          { label: 'One-off fit-out repair', amount: 9000, verified: false },
        ],
        negative_adjustments: [{ label: 'Market wage for spouse', amount: -22000 }],
      }],
      lease: { years_remaining: 3, options_years: 5, rent_pct_revenue: 11 },
      customers: { recurring_revenue_pct: 0, top_customer_pct: 2 },
      operations: { owner_role: 'on_tools', has_manager: false, sops_documented: false },
    }],
  }, null, 2);
}

export function recordsToCsv(records: BizRecord[], extra?: (r: BizRecord) => Record<string, string | number>): string {
  const headers = FIELDS.map((f) => f.key as string);
  const extraHeaders = extra && records[0] ? Object.keys(extra(records[0])) : [];
  return Papa.unparse({
    fields: [...headers, ...extraHeaders],
    data: records.map((r) => {
      const e = extra?.(r) ?? {};
      return [...headers.map((h) => {
        const v = (r as unknown as Record<string, unknown>)[h];
        return v === undefined ? '' : String(v);
      }), ...extraHeaders.map((h) => String(e[h] ?? ''))];
    }),
  });
}

export function download(name: string, text: string, type = 'text/csv') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
