import {
  ASSET_COND, FIN_QUALITY, HEADROOM, LEGAL, OUTLOOK, OWNER_ROLES, STATES, STATUSES, TIERS, TURNOVER,
  type FieldKey,
} from './types';

export type FieldType =
  | 'string' | 'number' | 'integer' | 'percent' | 'signed_percent'
  | 'boolean' | 'date' | 'url' | 'enum' | 'score05' | 'industry';

export type GroupId = 'identity' | 'financials' | 'revenue' | 'operations' | 'location' | 'growth' | 'deal' | 'extra';

export const GROUPS: { id: GroupId; label: string; note?: string }[] = [
  { id: 'identity', label: 'Identity and deal' },
  { id: 'financials', label: 'Financials', note: 'Per year: _y1 latest, _y2, _y3. AUD.' },
  { id: 'revenue', label: 'Revenue quality and customers' },
  { id: 'operations', label: 'Operations and people' },
  { id: 'location', label: 'Location and premises' },
  { id: 'growth', label: 'Growth prospects' },
  { id: 'deal', label: 'Deal terms', note: 'Affect financeability, not fair value.' },
  { id: 'extra', label: 'Calculator additions', note: 'Inputs the formula uses that the v1 schema did not name.' },
];

export interface FieldDef {
  key: FieldKey;
  label: string;
  group: GroupId;
  type: FieldType;
  /** true = always; 'listed' = when status is listed/under_offer; 'sold' = when sold */
  required?: true | 'listed' | 'sold';
  options?: readonly string[];
  notes?: string;
  unit?: string;
}

const f = (key: FieldKey, label: string, group: GroupId, type: FieldType, extra: Partial<FieldDef> = {}): FieldDef => ({
  key, label, group, type, ...extra,
});

const perYear = (base: 'revenue' | 'net_profit' | 'owner_wage' | 'addbacks' | 'negative_adjustments', label: string, notes?: string): FieldDef[] =>
  ([1, 2, 3] as const).map((n) =>
    f(`${base}_y${n}` as FieldKey, `${label} Y${n}`, 'financials', 'number', {
      unit: 'AUD',
      required: n === 1 && ['revenue', 'net_profit', 'owner_wage'].includes(base) ? true : undefined,
      notes: n === 1 ? notes : undefined,
    }),
  );

export const FIELDS: FieldDef[] = [
  f('record_id', 'Record ID', 'identity', 'string', { required: true, notes: 'Unique; used to upsert on re-import' }),
  f('business_name', 'Business name', 'identity', 'string', { required: true }),
  f('status', 'Status', 'identity', 'enum', { required: true, options: STATUSES }),
  f('industry_code', 'Industry code', 'identity', 'industry', { required: true, notes: 'ANZSIC division letter + 4-digit subclass, e.g. H4511' }),
  f('asking_price', 'Asking price', 'identity', 'number', { required: 'listed', unit: 'AUD', notes: 'Required when status is listed' }),
  f('sale_price', 'Sale price', 'identity', 'number', { required: 'sold', unit: 'AUD', notes: 'Required when status is sold' }),
  f('listed_date', 'Listed date', 'identity', 'date'),
  f('sold_date', 'Sold date', 'identity', 'date'),
  f('price_includes_stock', 'Price includes stock', 'identity', 'boolean', { notes: 'Default false; stock added on top otherwise' }),
  f('stock_at_cost', 'Stock at cost', 'identity', 'number', { unit: 'AUD' }),
  f('source_url', 'Source URL', 'identity', 'url'),

  ...perYear('revenue', 'Revenue'),
  ...perYear('net_profit', 'Net profit', 'Tax-return figure'),
  ...perYear('owner_wage', 'Owner wage', 'Includes super'),
  ...perYear('addbacks', 'Add-backs', 'Total; itemise in JSON addbacks[]'),
  f('addbacks_verified_pct', 'Add-backs verified', 'financials', 'percent', { unit: '%', notes: 'Share with documentary proof' }),
  ...perYear('negative_adjustments', 'Negative adjustments', 'Market wages, market rent, non-operating income (subtracted)'),
  f('maintenance_capex', 'Maintenance capex', 'financials', 'number', { unit: 'AUD/yr' }),
  f('deferred_capex', 'Deferred capex', 'financials', 'number', { unit: 'AUD', notes: 'One-off, deducted from FV' }),
  f('gross_margin_pct', 'Gross margin', 'financials', 'percent', { unit: '%' }),
  f('financials_quality', 'Financials quality', 'financials', 'enum', { options: FIN_QUALITY }),

  f('recurring_revenue_pct', 'Recurring revenue', 'revenue', 'percent', { unit: '%' }),
  f('top_customer_pct', 'Top customer share', 'revenue', 'percent', { unit: '%' }),
  f('top5_customers_pct', 'Top 5 customers share', 'revenue', 'percent', { unit: '%' }),
  f('avg_contract_term_months', 'Avg contract term', 'revenue', 'number', { unit: 'months' }),
  f('customer_count', 'Customer count', 'revenue', 'integer'),

  f('owner_hours_per_week', 'Owner hours / week', 'operations', 'number', { unit: 'hrs' }),
  f('owner_role', 'Owner role', 'operations', 'enum', { options: OWNER_ROLES }),
  f('fte_count', 'FTE count', 'operations', 'number'),
  f('has_manager', 'Has manager', 'operations', 'boolean', { notes: 'Second-in-charge who can run it' }),
  f('sops_documented', 'SOPs documented', 'operations', 'boolean'),
  f('top_supplier_pct', 'Top supplier share', 'operations', 'percent', { unit: '%' }),
  f('licences_transferable', 'Licences transferable', 'operations', 'boolean'),
  f('legal_issues', 'Legal issues', 'operations', 'enum', { options: LEGAL }),

  f('state', 'State', 'location', 'enum', { required: true, options: STATES }),
  f('postcode', 'Postcode', 'location', 'string'),
  f('location_tier', 'Location tier', 'location', 'enum', { options: TIERS, notes: 'Derived from postcode if blank' }),
  f('location_dependent', 'Location dependent', 'location', 'boolean', { notes: 'Trade depends on this exact site' }),
  f('lease_years_remaining', 'Lease years remaining', 'location', 'number', { unit: 'yrs' }),
  f('lease_options_years', 'Lease option years', 'location', 'number', { unit: 'yrs' }),
  f('rent_pct_revenue', 'Rent / revenue', 'location', 'percent', { unit: '%' }),
  f('freehold_included', 'Freehold included', 'location', 'boolean', { notes: 'Valued separately, excluded from the multiple' }),

  f('sde_cagr_3y', 'SDE CAGR (3y)', 'growth', 'signed_percent', { unit: '%', notes: 'Calculated if blank and 2+ years exist' }),
  f('industry_outlook', 'Industry outlook', 'growth', 'enum', { options: OUTLOOK }),
  f('local_population_growth_pct', 'Local population growth', 'growth', 'signed_percent', { unit: '%' }),
  f('capacity_headroom', 'Capacity headroom', 'growth', 'enum', { options: HEADROOM }),
  f('digital_presence_score', 'Digital presence', 'growth', 'score05', { unit: '0–5' }),

  f('vendor_finance_pct', 'Vendor finance', 'deal', 'percent', { unit: '%' }),
  f('earnout_pct', 'Earn-out', 'deal', 'percent', { unit: '%' }),
  f('handover_weeks', 'Handover', 'deal', 'number', { unit: 'weeks' }),
  f('loan_rate_pct', 'Loan rate', 'deal', 'percent', { unit: '%', notes: 'Defaults to the setting' }),
  f('loan_term_years', 'Loan term', 'deal', 'number', { unit: 'yrs', notes: 'Default from settings (5)' }),

  f('staff_turnover', 'Staff turnover', 'extra', 'enum', { options: TURNOVER, notes: 'Feeds factor 11 (high = key staff likely to leave)' }),
  f('asset_condition', 'Asset condition', 'extra', 'enum', { options: ASSET_COND, notes: 'Feeds factor 13' }),
  f('abnormal_year', 'Abnormal year', 'extra', 'integer', { notes: '1, 2 or 3: documented abnormal year dropped from volatile weighting' }),
  f('excess_assets', 'Excess assets', 'extra', 'number', { unit: 'AUD', notes: 'Added to FV (Assets_excess)' }),
  f('freehold_value', 'Freehold value', 'extra', 'number', { unit: 'AUD', notes: 'Added to FV when freehold is included in price' }),
  f('plant_equipment_value', 'Plant & equipment value', 'extra', 'number', { unit: 'AUD', notes: 'Asset-based fallback for loss-making businesses' }),
];

export const FIELD_MAP: Record<string, FieldDef> = Object.fromEntries(FIELDS.map((d) => [d.key, d]));

/** The 9 fields required to produce a valuation (price counts once). */
export const REQUIRED_KEYS: FieldKey[] = [
  'record_id', 'business_name', 'status', 'industry_code', 'state',
  'revenue_y1', 'net_profit_y1', 'owner_wage_y1',
];
export const OPTIONAL_KEYS: FieldKey[] = FIELDS
  .map((d) => d.key)
  .filter((k) => !REQUIRED_KEYS.includes(k) && k !== 'asking_price' && k !== 'sale_price');
