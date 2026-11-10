export interface Settings {
  /** Expected sale ÷ asking. Default 0.92 (spec §5). */
  saleToAsking: number;
  /** Market wage for a replacement owner/manager, AUD incl. super. Editable assumption. */
  marketOwnerWage: number;
  /** Default loan rate for the DSCR test when a record has none. Editable assumption. */
  loanRatePct: number;
  loanTermYears: number;
  /** Buyer cash deposit share of price; the rest is assumed debt-funded. Editable assumption. */
  buyerEquityPct: number;
  dscrMin: number;
  /** Weights for a rising 3-year SDE (latest first). */
  weightsRising: [number, number, number];
  /** Multiplier applied to the latest year when SDE falls each year. */
  fallingFactor: number;
  /** Replace a sector's base multiple with the median of sold comparables once there are enough. */
  useComparables: boolean;
  minComps: number;
  /** Adjusted multiple is clamped to the industry range ± this many turns. */
  clampPad: number;
}

export const DEFAULT_SETTINGS: Settings = {
  saleToAsking: 0.92,
  marketOwnerWage: 90000,
  loanRatePct: 9,
  loanTermYears: 5,
  buyerEquityPct: 30,
  dscrMin: 1.25,
  weightsRising: [0.5, 0.3, 0.2],
  fallingFactor: 0.9,
  useComparables: true,
  minComps: 10,
  clampPad: 0.5,
};
