/**
 * Australian SDE multiple ranges, 2026.
 * Source: Business For Sale, "The Ultimate Guide on How to Value a Business in 2026" (Aug 2026).
 * Default base = range midpoint; "other" uses 2.7x, matching BizBuySell's US closed-deal average (Q1–Q2 2026).
 */
export interface Sector {
  id: string;
  label: string;
  min: number;
  max: number;
  base: number;
  /** ANZSIC prefixes (division letter + subclass digits) that map to this sector */
  prefixes: string[];
}

export const SECTORS: Sector[] = [
  { id: 'hospitality', label: 'Cafés and hospitality', min: 1.5, max: 2.5, base: 2.0, prefixes: ['H'] },
  { id: 'cleaning', label: 'Commercial cleaning (contracted fleet)', min: 2.0, max: 2.5, base: 2.25, prefixes: ['N731'] },
  { id: 'plumbing', label: 'Plumbing fleet, managed', min: 2.5, max: 3.5, base: 3.0, prefixes: ['E323'] },
  { id: 'childcare', label: 'Childcare, compliant', min: 3.0, max: 5.0, base: 4.0, prefixes: ['Q871'] },
  { id: 'other', label: 'All other (market default)', min: 2.0, max: 3.5, base: 2.7, prefixes: [] },
];

export const SECTOR_BY_ID: Record<string, Sector> = Object.fromEntries(SECTORS.map((s) => [s.id, s]));

export function sectorFor(industryCode: string | undefined): Sector {
  const code = (industryCode ?? '').toUpperCase().trim();
  let best: Sector | undefined;
  let bestLen = -1;
  for (const s of SECTORS) {
    for (const p of s.prefixes) {
      if (code.startsWith(p) && p.length > bestLen) {
        best = s;
        bestLen = p.length;
      }
    }
  }
  return best ?? SECTOR_BY_ID.other;
}
