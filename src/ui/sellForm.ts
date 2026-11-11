import { HEADROOM, LEGAL, OUTLOOK, STATES, TURNOVER } from '../engine/types';
import type { Settings } from '../engine/settings';
import type { CompsContext } from '../engine/value';
import { parseNumber } from '../import/parse';
import { validateRow } from '../import/validate';
import type { SellDraft } from '../store';

/** Common industries in plain language → ANZSIC 2006 code. */
export const INDUSTRY_PRESETS: [string, string][] = [
  ['H4511', 'Café or restaurant'],
  ['H4512', 'Takeaway food'],
  ['H4520', 'Pub, bar or tavern'],
  ['H4400', 'Accommodation'],
  ['N7311', 'Commercial cleaning'],
  ['E3231', 'Plumbing'],
  ['E3232', 'Electrical services'],
  ['E3299', 'Other trade or construction services'],
  ['Q8710', 'Childcare'],
  ['S9419', 'Automotive repair and servicing'],
  ['S9511', 'Hair and beauty'],
  ['G4279', 'Retail shop'],
  ['M6932', 'Accounting or bookkeeping'],
  ['I4610', 'Road freight and transport'],
  ['C2599', 'Manufacturing'],
  ['', 'Other: enter an ANZSIC code'],
];

export type Kind = 'money' | 'number' | 'pct' | 'yesno' | 'select' | 'text';
export interface Question {
  key: string;
  label: string;
  help?: string;
  kind: Kind;
  options?: [string, string][];
  /** Only show when another answer matches. */
  when?: (v: Record<string, string>) => boolean;
}
export interface Section { id: string; title: string; intro?: string; questions: Question[] }

const opts = (xs: readonly string[], labels?: Record<string, string>): [string, string][] => xs.map((x) => [x, labels?.[x] ?? x[0].toUpperCase() + x.slice(1).replace('_', ' ')]);

export const SECTIONS: Section[] = [
  {
    id: 'about', title: 'Your business', questions: [
      { key: 'business_name', label: 'Business name', kind: 'text' },
      { key: 'industry_preset', label: 'Industry', kind: 'select', options: INDUSTRY_PRESETS },
      { key: 'industry_code', label: 'ANZSIC code', kind: 'text', help: 'Letter + 4 digits, e.g. M6962', when: (v) => !v.industry_preset },
      { key: 'state', label: 'State', kind: 'select', options: STATES.map((s) => [s, s]) },
      { key: 'postcode', label: 'Postcode', kind: 'text', help: 'Sets location demand if you leave tier blank' },
    ],
  },
  {
    id: 'earn', title: 'Earnings', intro: 'From your tax returns. Latest year required; earlier years let buyers see the trend.',
    questions: [], // rendered as a year grid
  },
  {
    id: 'adjust', title: 'Adjustments', intro: 'What a buyer would add back or take off to see true owner earnings.',
    questions: [
      { key: 'addbacks_verified_pct', label: 'Add-backs you can prove with documents', kind: 'pct', help: 'Unproven add-backs are the first thing a buyer\'s accountant strips out' },
      { key: 'negative_adjustments_y1', label: 'Costs a buyer would add (latest year)', kind: 'money', help: 'E.g. market wage for family who work unpaid, market rent if you own the premises' },
      { key: 'maintenance_capex', label: 'Yearly maintenance spend on equipment', kind: 'money' },
    ],
  },
  {
    id: 'ops', title: 'How it runs', questions: [
      { key: 'owner_role', label: 'Your role', kind: 'select', options: [['on_tools', 'I work in it day to day'], ['manager', 'I manage; staff do the work'], ['absentee', 'It runs without me']] },
      { key: 'owner_hours_per_week', label: 'Your hours per week', kind: 'number' },
      { key: 'has_manager', label: 'Is there a second-in-charge who could run it?', kind: 'yesno' },
      { key: 'sops_documented', label: 'Are procedures written down?', kind: 'yesno' },
      { key: 'fte_count', label: 'Full-time-equivalent staff', kind: 'number' },
      { key: 'staff_turnover', label: 'Staff turnover', kind: 'select', options: opts(TURNOVER) },
    ],
  },
  {
    id: 'cust', title: 'Customers and suppliers', questions: [
      { key: 'recurring_revenue_pct', label: 'Revenue on contract or subscription', kind: 'pct' },
      { key: 'avg_contract_term_months', label: 'Typical contract length (months)', kind: 'number', when: (v) => parseNumber(v.recurring_revenue_pct ?? '') > 0 },
      { key: 'top_customer_pct', label: 'Largest customer\'s share of revenue', kind: 'pct' },
      { key: 'top_supplier_pct', label: 'Largest supplier\'s share of purchases', kind: 'pct' },
    ],
  },
  {
    id: 'prem', title: 'Premises', questions: [
      { key: 'freehold_included', label: 'Are you selling the property too?', kind: 'yesno' },
      { key: 'freehold_value', label: 'Property value', kind: 'money', when: (v) => v.freehold_included === 'true' },
      { key: 'lease_years_remaining', label: 'Years left on the lease', kind: 'number', when: (v) => v.freehold_included !== 'true' },
      { key: 'lease_options_years', label: 'Option years after that', kind: 'number', when: (v) => v.freehold_included !== 'true' },
      { key: 'annual_rent', label: 'Annual rent', kind: 'money', when: (v) => v.freehold_included !== 'true' },
      { key: 'location_dependent', label: 'Does trade depend on this exact site (walk-in, foot traffic)?', kind: 'yesno' },
    ],
  },
  {
    id: 'risk', title: 'Records, risks and outlook', questions: [
      { key: 'financials_quality', label: 'Who prepares your financials?', kind: 'select', options: [['accountant_prepared', 'An accountant'], ['bas_only', 'BAS only'], ['owner_prepared', 'I do']] },
      { key: 'legal_issues', label: 'Any legal disputes or compliance issues?', kind: 'select', options: opts(LEGAL, { none: 'None', minor: 'Minor', material: 'Material' }) },
      { key: 'industry_outlook', label: 'Industry outlook', kind: 'select', options: opts(OUTLOOK) },
      { key: 'capacity_headroom', label: 'Can revenue grow without new equipment or premises?', kind: 'select', options: opts(HEADROOM, { high: 'Yes, plenty of room', some: 'Some room', none: 'No, at capacity' }) },
      { key: 'asset_condition', label: 'Condition of equipment and fit-out', kind: 'select', options: [['renewed', 'Recently renewed'], ['normal', 'Normal wear'], ['worn', 'Worn']] },
      { key: 'deferred_capex', label: 'Overdue repairs or replacements', kind: 'money', help: 'Buyers deduct this from the price in full' },
    ],
  },
  {
    id: 'terms', title: 'Sale terms', questions: [
      { key: 'price_includes_stock', label: 'Will the price include stock?', kind: 'yesno', help: 'Usually no: stock is added at cost on settlement' },
      { key: 'stock_at_cost', label: 'Stock at cost', kind: 'money', when: (v) => v.price_includes_stock === 'true' },
      { key: 'vendor_finance_pct', label: 'Willing to offer vendor finance (% of price)', kind: 'pct' },
      { key: 'plant_equipment_value', label: 'Value of plant and equipment', kind: 'money', help: 'Sets the floor if earnings are at or below zero' },
    ],
  },
];

export const YEAR_ROWS: [string, string, string?][] = [
  ['revenue', 'Revenue'],
  ['net_profit', 'Net profit (tax return)'],
  ['owner_wage', 'Your wage + super', 'What you pay yourself (and super)'],
  ['addbacks', 'Add-backs', 'One-offs and personal costs run through the business'],
];

export const CHECKLIST: [string, string][] = [
  ['pl', 'Three years of P&L that match lodged tax returns'],
  ['addbacks', 'Evidence for every add-back (invoices, statements)'],
  ['lease', 'Full lease, with options and any assignment terms'],
  ['duties', 'A written list of your duties and hours'],
  ['family', 'Family wages and discretionary expenses identified'],
  ['staff', 'Staff list with roles, tenure and award or contract'],
  ['assets', 'Plant and equipment list with condition'],
  ['licences', 'Licences and permits, and whether they transfer'],
];

/** Convert the owner's answers into a schema record and run it through the shared validation pipeline. */
export function draftToResult(d: SellDraft, settings: Settings, comps: CompsContext) {
  const v = d.values;
  const mapped: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) if (val !== '' && k !== 'annual_rent' && k !== 'industry_preset') mapped[k] = val;
  mapped.record_id = d.id;
  mapped.business_name = v.business_name?.trim() || 'My business';
  mapped.status = 'listed';
  mapped.industry_code = v.industry_preset || v.industry_code || '';
  if (!mapped.state) mapped.state = 'NSW';
  const rent = parseNumber(v.annual_rent ?? '');
  const rev = parseNumber(v.revenue_y1 ?? '');
  if (!Number.isNaN(rent) && !Number.isNaN(rev) && rev > 0 && v.freehold_included !== 'true') mapped.rent_pct_revenue = Math.round((rent / rev) * 1000) / 10;
  return validateRow(mapped, settings, comps, { requirePrice: false });
}

export const EXAMPLE_VALUES: Record<string, string> = {
  business_name: 'Example: Inner West Café', industry_preset: 'H4511', state: 'NSW', postcode: '2042',
  revenue_y1: '1,150,000', net_profit_y1: '96,000', owner_wage_y1: '85,000', addbacks_y1: '18,000',
  revenue_y2: '1,080,000', net_profit_y2: '88,000', owner_wage_y2: '85,000', addbacks_y2: '15,000',
  revenue_y3: '1,010,000', net_profit_y3: '79,000', owner_wage_y3: '80,000',
  addbacks_verified_pct: '60', owner_role: 'on_tools', owner_hours_per_week: '50', has_manager: 'false', sops_documented: 'false',
  fte_count: '8', top_customer_pct: '1', top_supplier_pct: '30', lease_years_remaining: '2', lease_options_years: '5', annual_rent: '98,000',
  location_dependent: 'true', financials_quality: 'accountant_prepared', legal_issues: 'none', industry_outlook: 'stable', capacity_headroom: 'some', asset_condition: 'normal',
};
