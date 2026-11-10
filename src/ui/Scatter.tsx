import { useMemo, useState } from 'react';
import type { Sector } from '../engine/sectors';
import { VERDICTS, type ValuationResult } from '../engine/value';
import type { BizRecord } from '../engine/types';
import { aud, audK, mult, ratio } from '../format';
import { verdictLabel } from './common';
import { useWidth } from './useWidth';

export interface Item { r: BizRecord; v: ValuationResult }

const logTicks = (lo: number, hi: number) => {
  const out: number[] = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of [1, 2, 5]) {
      const t = m * 10 ** e;
      if (t >= lo && t <= hi) out.push(t);
    }
  }
  return out;
};

/**
 * Portfolio scatter: x = weighted SDE (log), y = price (log).
 * The shaded corridor is the sector's multiple range; dots above it are priced above, below it under.
 */
export function Scatter({ items, sector, selectedId, onSelect }: { items: Item[]; sector: Sector; selectedId?: string; onSelect: (id: string) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ it: Item; x: number; y: number } | null>(null);
  const height = width < 520 ? 300 : 400;
  const m = { l: 56, r: 12, t: 12, b: 38 };
  const pts = items.filter((it) => it.v.price !== undefined && it.v.price > 0 && it.v.sde.weighted > 0);

  const scales = useMemo(() => {
    const xs = pts.map((p) => p.v.sde.weighted);
    const ys = pts.map((p) => p.v.price!);
    const xlo = Math.min(...xs, 80_000) / 1.25;
    const xhi = Math.max(...xs, 400_000) * 1.25;
    const ylo = Math.min(...ys, xlo * sector.min) / 1.15;
    const yhi = Math.max(...ys, xhi * sector.max * 0.6) * 1.15;
    const lx = (v: number) => m.l + ((Math.log(v) - Math.log(xlo)) / (Math.log(xhi) - Math.log(xlo))) * (width - m.l - m.r);
    const ly = (v: number) => height - m.b - ((Math.log(v) - Math.log(ylo)) / (Math.log(yhi) - Math.log(ylo))) * (height - m.t - m.b);
    return { xlo, xhi, ylo, yhi, lx, ly };
  }, [pts, width, height, sector]);

  const { xlo, xhi, ylo, yhi, lx, ly } = scales;
  const clipY = (v: number) => Math.max(ylo, Math.min(yhi, v));
  const corridor = [
    [xlo, clipY(xlo * sector.min)], [xhi, clipY(xhi * sector.min)], [xhi, clipY(xhi * sector.max)], [xlo, clipY(xlo * sector.max)],
  ].map(([a, b]) => `${lx(a)},${ly(b)}`).join(' ');

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <svg className="chart" width={width} height={height} role="img" aria-label={`Scatter of ${pts.length} listings: weighted SDE against price`}>
        <defs>
          {VERDICTS.map((vd) => (
            <pattern key={vd.id} id={`hatch-${vd.id}`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="4" height="4" style={{ fill: 'var(--surface)' }} />
              <line x1="0" y1="0" x2="0" y2="4" style={{ stroke: `var(--v-${vd.id.replace('_', '-')})` }} strokeWidth="2.2" />
            </pattern>
          ))}
          <clipPath id="plot"><rect x={m.l} y={m.t} width={width - m.l - m.r} height={height - m.t - m.b} /></clipPath>
        </defs>
        <g className="grid">
          {logTicks(xlo, xhi).map((t) => <line key={`x${t}`} x1={lx(t)} x2={lx(t)} y1={m.t} y2={height - m.b} />)}
          {logTicks(ylo, yhi).map((t) => <line key={`y${t}`} x1={m.l} x2={width - m.r} y1={ly(t)} y2={ly(t)} />)}
        </g>
        <g clipPath="url(#plot)">
          <polygon className="corridor" points={corridor} />
          <line className="corridor-edge" x1={lx(xlo)} y1={ly(xlo * sector.min)} x2={lx(xhi)} y2={ly(xhi * sector.min)} />
          <line className="corridor-edge" x1={lx(xlo)} y1={ly(xlo * sector.max)} x2={lx(xhi)} y2={ly(xhi * sector.max)} />
          <line className="fairline" x1={lx(xlo)} y1={ly(xlo * sector.base)} x2={lx(xhi)} y2={ly(xhi * sector.base)} />
        </g>
        {logTicks(xlo, xhi).map((t) => <text key={`xl${t}`} x={lx(t)} y={height - m.b + 16} textAnchor="middle">{audK(t)}</text>)}
        {logTicks(ylo, yhi).map((t) => <text key={`yl${t}`} x={m.l - 8} y={ly(t) + 4} textAnchor="end">{audK(t)}</text>)}
        <text x={width - m.r} y={height - 4} textAnchor="end">Weighted SDE (AUD, log) →</text>
        <text x={m.l + 6} y={m.t + 12}>↑ Price (AUD, log)</text>
        <g clipPath="url(#plot)">
          {pts.map((it) => {
            const cx = lx(it.v.sde.weighted);
            const cy = ly(it.v.price!);
            const vid = it.v.verdict ?? 'fair';
            const color = `var(--v-${vid.replace('_', '-')})`;
            const fill = it.v.confirmed ? color : `url(#hatch-${vid})`;
            const common = {
              className: `dot${selectedId === it.r.record_id ? ' sel' : ''}`,
              style: { fill, stroke: color, strokeWidth: 1.2 },
              onMouseEnter: () => setHover({ it, x: cx, y: cy }),
              onMouseLeave: () => setHover(null),
              onClick: () => onSelect(it.r.record_id),
              tabIndex: 0,
              onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') onSelect(it.r.record_id); },
              'aria-label': `${it.r.business_name}: P/FV ${ratio(it.v.pfv)}, ${verdictLabel(it.v.verdict)}`,
            };
            return it.r.status === 'sold'
              ? <rect key={it.r.record_id} x={cx - 5} y={cy - 5} width={10} height={10} rx={1.5} {...common} />
              : <circle key={it.r.record_id} cx={cx} cy={cy} r={6} {...common} />;
          })}
        </g>
      </svg>
      {hover && (
        <div className="chart-tip" style={{ left: hover.x, top: hover.y }}>
          <div style={{ fontWeight: 600 }}>{hover.it.r.business_name}</div>
          <div>{hover.it.v.priceKind === 'sale' ? 'Sold' : 'Asking'} {aud(hover.it.v.price)} · FV {aud(hover.it.v.fvPoint)}</div>
          <div>P/FV {ratio(hover.it.v.pfv)} · implied {mult(hover.it.v.impliedMultiple)} · {verdictLabel(hover.it.v.verdict)}{hover.it.v.confirmed ? '' : ' (within margin)'}</div>
        </div>
      )}
      <div className="legend" style={{ marginTop: 8 }}>
        <span>Corridor: {sector.label} {mult(sector.min)}–{mult(sector.max)} · line at base {mult(sector.base)}</span>
        <span>● listed · ■ sold · hatched = within margin of error</span>
      </div>
    </div>
  );
}
