import Papa from 'papaparse';
import { FIELDS, FIELD_MAP } from '../engine/fields';
import type { Settings } from '../engine/settings';
import type { BizRecord } from '../engine/types';
import { value, type CompsContext, type ValuationResult } from '../engine/value';
import { coerceField } from './parse';
import { RecordSchema } from './schema';

export const MAX_ROWS = 5000;
export const MAX_BYTES = 10 * 1024 * 1024;

export type RowStatus = 'valid' | 'warning' | 'rejected';

export interface CellIssue {
  field: string;
  severity: 'reject' | 'warn';
  message: string;
  suggestion?: string;
}

export interface RowResult {
  index: number;
  raw: Record<string, unknown>;
  record?: BizRecord;
  status: RowStatus;
  issues: CellIssue[];
  valuation?: ValuationResult;
}

/** header → field key ('' = ignore) */
export type Mapping = Record<string, string>;

const normHeader = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, '_');

export function autoMap(headers: string[]): Mapping {
  const m: Mapping = {};
  for (const h of headers) m[h] = FIELD_MAP[normHeader(h)] ? normHeader(h) : '';
  return m;
}

export function parseCsvText(text: string): { headers: string[]; rows: Record<string, unknown>[]; error?: string } {
  const res = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), { header: true, skipEmptyLines: 'greedy' });
  const headers = res.meta.fields ?? [];
  const fatal = res.errors.find((e) => e.type === 'Delimiter');
  return { headers, rows: res.data, error: fatal?.message };
}

export function applyMapping(raw: Record<string, unknown>, mapping: Mapping): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [h, v] of Object.entries(raw)) {
    const key = mapping[h] ?? (FIELD_MAP[h] ? h : '');
    if (key) out[key] = v;
  }
  return out;
}

/** Validate one mapped row. Coerces each cell, then runs the Zod record schema and warning rules. */
export function validateRow(mapped: Record<string, unknown>, settings: Settings, comps?: CompsContext): Omit<RowResult, 'index' | 'raw'> {
  const issues: CellIssue[] = [];
  const coerced: Record<string, unknown> = {};
  for (const def of FIELDS) {
    if (!(def.key in mapped)) continue;
    const c = coerceField(def, mapped[def.key]);
    if (c.ok) { if (c.value !== undefined) coerced[def.key] = c.value; }
    else issues.push({ field: def.key, severity: 'reject', message: c.error, suggestion: c.suggestion });
  }
  const bad = new Set(issues.map((i) => i.field));
  const parsed = RecordSchema.safeParse(coerced);
  if (!parsed.success) {
    for (const iss of parsed.error.issues) {
      const field = String(iss.path[0] ?? '');
      if (bad.has(field)) continue;
      const missing = iss.code === 'invalid_type' && iss.received === 'undefined';
      issues.push({ field, severity: 'reject', message: missing ? 'Required field missing' : iss.message });
    }
  }
  if (issues.length) return { status: 'rejected', issues };

  const record = parsed.data as unknown as BizRecord;
  const valuation = value(record, settings, { comps });
  if (valuation.impliedMultiple !== undefined && (valuation.impliedMultiple < 0.5 || valuation.impliedMultiple > 8)) {
    issues.push({ field: record.asking_price !== undefined ? 'asking_price' : 'sale_price', severity: 'warn', message: `Implied multiple ${valuation.impliedMultiple.toFixed(2)}x outside 0.5x–8x: likely a typo or a freehold included in price` });
  }
  const y1 = valuation.sde.years[0];
  if (y1 && record.revenue_y1 > 0 && y1.sde / record.revenue_y1 > 0.6) {
    issues.push({ field: 'addbacks_y1', severity: 'warn', message: 'SDE margin over 60% of revenue: add-backs may be overstated' });
  }
  return { status: issues.length ? 'warning' : 'valid', issues, record, valuation };
}

export function validateRows(rawRows: Record<string, unknown>[], mapping: Mapping | null, settings: Settings, comps?: CompsContext): RowResult[] {
  const seen = new Set<string>();
  return rawRows.slice(0, MAX_ROWS).map((raw, index) => {
    const mapped = mapping ? applyMapping(raw, mapping) : raw;
    const res = validateRow(mapped, settings, comps);
    const id = res.record?.record_id ?? (typeof mapped.record_id === 'string' ? mapped.record_id.trim() : undefined);
    if (id) {
      if (seen.has(id)) {
        return { index, raw, status: 'rejected', issues: [{ field: 'record_id', severity: 'reject', message: `Duplicate record_id "${id}" in file (second occurrence rejected)` }] };
      }
      seen.add(id);
    }
    return { index, raw, ...res };
  });
}

export function errorsCsv(rows: RowResult[]): string {
  const rejected = rows.filter((r) => r.status === 'rejected');
  const headers = Array.from(new Set(rejected.flatMap((r) => Object.keys(r.raw))));
  const data = rejected.map((r) => ({
    ...Object.fromEntries(headers.map((h) => [h, r.raw[h] ?? ''])),
    error: r.issues.map((i) => `${i.field}: ${i.message}${i.suggestion ? ` (did you mean "${i.suggestion}"?)` : ''}`).join('; '),
  }));
  return Papa.unparse({ fields: [...headers, 'error'], data: data.map((d) => [...headers.map((h) => d[h as keyof typeof d]), d.error]) });
}
