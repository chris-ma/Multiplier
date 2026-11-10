# Multiplier: small business valuation screen (AU)

Screens Australian small business listings as **normalised SDE × a risk-adjusted multiple**. Each listing is then shown as a **Price-to-Fair-Value ratio (P/FV)** with one of five verdict bands.

```
FV = SDE_weighted × (M_base + Σ sᵢ·wᵢ) + Inventory + Assets_excess − CapEx_deferred
```

## What's in v1

- **Valuation engine** (`src/engine/value.ts`): a pure `value(record, settings) → result` function. It covers SDE normalisation, 3-year weighting, sector base multiples, the 13 factors, the clamp, hard overrides, the asset-based fallback for loss-making businesses, confidence bands, verdicts and the DSCR lender test.
- **Bulk import** of CSV or JSON, up to 5,000 rows or 10 MB. Columns auto-map, mappings can be saved as named templates, then rows are validated with Zod and shown in a preview with P/FV. You commit the rows, or download the rejected ones with an `error` column. Records upsert on `record_id`.
- **Portfolio view**: a log-log scatter with a sector corridor, filters, saved views shareable by URL, a sortable table with P/FV mini-bars, and CSV export.
- **Business detail view**: a P/FV strip with a confidence bracket, a multiple waterfall, live what-if factor sliders, the SDE build-up, and a one-page PDF summary through browser print.
- **Single-record calculator form**: it runs through the same validation pipeline as bulk import.
- **Settings**: sale-to-asking ratio, market owner wage, loan assumptions, weighting rules and a toggle for sold comparables. When a sector has 10 or more sold records, their median multiple replaces its base multiple.
- Light and dark themes built from tokens. Colour is used only for verdicts, and every verdict always has a text label.

Data is stored locally in the browser (IndexedDB). There is no server.

## Run

```bash
npm install
npm run dev       # local dev server
npm test          # engine + import unit tests (vitest)
npm run build     # type-check + production build to dist/
```

## Deploy to Vercel

This is a static Vite app, and `vercel.json` sets the build to `npm run build` with output in `dist`, plus an SPA rewrite.

1. Import the GitHub repository in Vercel (**Add New → Project**). Vercel detects the framework as Vite.
2. Deploy. You don't need any environment variables.

Or use the CLI: `npx vercel --prod`.

## Additions beyond the spec schema

The formula needs a few inputs that the 51-field schema did not name. They are optional, and they sit in a "Calculator additions" group:
`staff_turnover` (factor 11), `asset_condition` (factor 13), `abnormal_year` (volatile weighting), `excess_assets`, `freehold_value`, `plant_equipment_value` (loss-making fallback).

## Assumptions to review

These defaults are editable assumptions, not sourced figures: the market owner wage ($90,000), the default loan rate (9%), and buyer equity (30%; the rest of the asking price is treated as debt for the DSCR test). The thresholds that turn factor data into −1 and +1 scores, and the postcode-to-location-tier ranges, are approximations documented in `src/engine/factors.ts` and `src/engine/location.ts`.

## Limitations

This tool gives a screening estimate. It is not a formal valuation and not financial advice. Industry ranges are broker rules of thumb (Business For Sale, Aug 2026), and factor weights should be back-tested against your own sold records. See the in-app **Method** page for sources.
