export const STATUSES = ['listed', 'under_offer', 'sold', 'withdrawn'] as const;
export const OWNER_ROLES = ['absentee', 'manager', 'on_tools'] as const;
export const FIN_QUALITY = ['accountant_prepared', 'bas_only', 'owner_prepared'] as const;
export const LEGAL = ['none', 'minor', 'material'] as const;
export const STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'] as const;
export const TIERS = ['metro_cbd', 'metro', 'regional_city', 'regional', 'remote'] as const;
export const OUTLOOK = ['growing', 'stable', 'declining'] as const;
export const HEADROOM = ['high', 'some', 'none'] as const;
export const TURNOVER = ['low', 'normal', 'high'] as const;
export const ASSET_COND = ['renewed', 'normal', 'worn'] as const;

export type Status = (typeof STATUSES)[number];
export type OwnerRole = (typeof OWNER_ROLES)[number];
export type FinancialsQuality = (typeof FIN_QUALITY)[number];
export type LegalIssues = (typeof LEGAL)[number];
export type StateCode = (typeof STATES)[number];
export type LocationTier = (typeof TIERS)[number];
export type Outlook = (typeof OUTLOOK)[number];
export type Headroom = (typeof HEADROOM)[number];
export type StaffTurnover = (typeof TURNOVER)[number];
export type AssetCondition = (typeof ASSET_COND)[number];

/** One business record. Keys are the exact CSV header / flat JSON keys. */
export interface BizRecord {
  // Identity and deal
  record_id: string;
  business_name: string;
  status: Status;
  industry_code: string;
  asking_price?: number;
  sale_price?: number;
  listed_date?: string;
  sold_date?: string;
  price_includes_stock?: boolean;
  stock_at_cost?: number;
  source_url?: string;
  // Financials (y1 = latest)
  revenue_y1: number;
  revenue_y2?: number;
  revenue_y3?: number;
  net_profit_y1: number;
  net_profit_y2?: number;
  net_profit_y3?: number;
  owner_wage_y1: number;
  owner_wage_y2?: number;
  owner_wage_y3?: number;
  addbacks_y1?: number;
  addbacks_y2?: number;
  addbacks_y3?: number;
  addbacks_verified_pct?: number;
  negative_adjustments_y1?: number;
  negative_adjustments_y2?: number;
  negative_adjustments_y3?: number;
  maintenance_capex?: number;
  deferred_capex?: number;
  gross_margin_pct?: number;
  financials_quality?: FinancialsQuality;
  // Revenue quality and customers
  recurring_revenue_pct?: number;
  top_customer_pct?: number;
  top5_customers_pct?: number;
  avg_contract_term_months?: number;
  customer_count?: number;
  // Operations and people
  owner_hours_per_week?: number;
  owner_role?: OwnerRole;
  fte_count?: number;
  has_manager?: boolean;
  sops_documented?: boolean;
  top_supplier_pct?: number;
  licences_transferable?: boolean;
  legal_issues?: LegalIssues;
  // Location and premises
  state: StateCode;
  postcode?: string;
  location_tier?: LocationTier;
  location_dependent?: boolean;
  lease_years_remaining?: number;
  lease_options_years?: number;
  rent_pct_revenue?: number;
  freehold_included?: boolean;
  // Growth prospects
  sde_cagr_3y?: number;
  industry_outlook?: Outlook;
  local_population_growth_pct?: number;
  capacity_headroom?: Headroom;
  digital_presence_score?: number;
  // Deal terms
  vendor_finance_pct?: number;
  earnout_pct?: number;
  handover_weeks?: number;
  loan_rate_pct?: number;
  loan_term_years?: number;
  // Calculator additions (inputs the formula needs that the spec schema lacks)
  staff_turnover?: StaffTurnover;
  asset_condition?: AssetCondition;
  abnormal_year?: number;
  excess_assets?: number;
  freehold_value?: number;
  plant_equipment_value?: number;
}

export type FieldKey = keyof BizRecord;
