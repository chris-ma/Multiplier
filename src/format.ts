const audFmt = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
const audFmt2 = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** AUD, no decimals above $10k. */
export const aud = (n: number | undefined) =>
  n === undefined || Number.isNaN(n) ? '—' : Math.abs(n) >= 10000 ? audFmt.format(n) : audFmt2.format(n);

export const audK = (n: number | undefined) => {
  if (n === undefined || Number.isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e6) return `$${(n / 1e6).toFixed(a >= 1e7 ? 0 : 2)}m`;
  if (a >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${Math.round(n)}`;
};

/** Multiples to two decimals with an x suffix. */
export const mult = (n: number | undefined) => (n === undefined || Number.isNaN(n) ? '—' : `${n.toFixed(2)}x`);
export const turns = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(2)}`;
export const ratio = (n: number | undefined) => (n === undefined || Number.isNaN(n) ? '—' : n.toFixed(2));
export const pct = (n: number | undefined, d = 0) => (n === undefined || Number.isNaN(n) ? '—' : `${n.toFixed(d)}%`);

/** Current date-time in AEST/AEDT (Australia/Sydney). */
export const nowAest = () =>
  new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
