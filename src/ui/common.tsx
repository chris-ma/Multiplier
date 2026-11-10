import type { ReactNode } from 'react';
import { VERDICTS, type ValuationResult, type VerdictId } from '../engine/value';
import { ratio } from '../format';

export const verdictLabel = (v?: VerdictId) => VERDICTS.find((x) => x.id === v)?.label ?? 'No price';

/** Hover/focus explanation. Every number on screen should be explainable. */
export function Explain({ children, tip, right }: { children: ReactNode; tip: ReactNode; right?: boolean }) {
  return (
    <span className={`explain${right ? ' right' : ''}`} tabIndex={0}>
      {children}
      <span className="tip" role="tooltip">{tip}</span>
    </span>
  );
}

/** Verdict is always colour + label, never colour alone. Hatched swatch = within margin of error. */
export function VerdictTag({ v, short }: { v: ValuationResult; short?: boolean }) {
  if (!v.verdict) return <span className="vtag v-none muted">{v.lossMaking ? 'Asset value only' : 'No price'}</span>;
  return (
    <span className={`vtag v-${v.verdict}${v.confirmed ? '' : ' unconfirmed'}`}>
      {verdictLabel(v.verdict)}
      {!v.confirmed && !short && <span className="muted">· within margin of error</span>}
    </span>
  );
}

/** Inline P/FV mini-bar: scale 0.6–1.6, tick at 1.00. */
export function MiniBar({ v }: { v: ValuationResult }) {
  if (v.pfv === undefined || !v.verdict) return <span className="muted">—</span>;
  const pos = (x: number) => ((Math.min(1.6, Math.max(0.6, x)) - 0.6) / 1.0) * 100;
  const a = pos(Math.min(1, v.pfv));
  const b = pos(Math.max(1, v.pfv));
  return (
    <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
      <span className={`minibar v-${v.verdict}`} aria-hidden>
        <span className="track" />
        <span className={`bar${v.confirmed ? '' : ' unconfirmed'}`} style={{ left: `${a}%`, width: `${Math.max(2, b - a)}%` }} />
        <span className="mid" />
      </span>
      <span className="num" style={{ minWidth: 34 }}>{ratio(v.pfv)}</span>
    </span>
  );
}

export function Flags({ v }: { v: ValuationResult }) {
  const items = [
    ...v.overrideNotes.map((t) => ({ t, k: v.requiresReview && t.startsWith('Material') ? 'bad' : 'warn' })),
    ...v.flags.map((t) => ({ t, k: t.startsWith('Unfinanceable') ? 'bad' : 'warn' })),
    ...(v.clampNote ? [{ t: v.clampNote, k: '' }] : []),
  ];
  if (!items.length) return null;
  return <div className="stack" style={{ gap: 6 }}>{items.map((x, i) => <div key={i} className={`flag ${x.k}`}>{x.t}</div>)}</div>;
}
