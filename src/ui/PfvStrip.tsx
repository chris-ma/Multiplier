import { VERDICTS, type ValuationResult } from '../engine/value';
import { aud, ratio } from '../format';
import { useWidth } from './useWidth';

const LO = 0.6;
const HI = 1.6;

/**
 * The core "above or below fair value" visual: one horizontal P/FV scale from 0.6 to 1.6,
 * the five verdict bands as quiet tints, the confidence range as a bracket around 1.00,
 * and the price as one solid marker with its P/FV printed beside it.
 */
export function PfvStrip({ v }: { v: ValuationResult }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const m = { l: 8, r: 8 };
  const h = 92;
  const trackY = 40;
  const x = (p: number) => m.l + ((Math.min(HI, Math.max(LO, p)) - LO) / (HI - LO)) * (width - m.l - m.r);
  const ticks = [0.6, 0.85, 0.95, 1.05, 1.15, 1.6];
  const pfv = v.pfv;
  const off = pfv !== undefined && (pfv < LO || pfv > HI);
  const bl = 1 - v.bandPct;
  const bh = 1 + v.bandPct;

  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={h} role="img" aria-label={pfv !== undefined ? `P/FV ${ratio(pfv)}; fair value range ${aud(v.fvLow)} to ${aud(v.fvHigh)}` : 'No price'}>
        {VERDICTS.map((b) => {
          const a = x(Math.max(LO, b.from));
          const c = x(Math.min(HI, b.to));
          return <rect key={b.id} x={a} y={trackY - 12} width={c - a} height={24} style={{ fill: `var(--v-${b.id.replace('_', '-')})`, opacity: 0.16 }} />;
        })}
        <line x1={x(LO)} x2={x(HI)} y1={trackY} y2={trackY} style={{ stroke: 'var(--line-2)' }} />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={trackY + 12} y2={trackY + 16} style={{ stroke: 'var(--ink-3)' }} />
            <text x={x(t)} y={trackY + 28} textAnchor={t === LO ? 'start' : t === HI ? 'end' : 'middle'}>{t.toFixed(2)}</text>
          </g>
        ))}
        <line x1={x(1)} x2={x(1)} y1={trackY - 14} y2={trackY + 14} style={{ stroke: 'var(--ink-2)' }} strokeDasharray="2 2" />
        {/* Confidence bracket: FV range expressed on the P/FV axis */}
        <path d={`M${x(bl)},${trackY - 18} v-6 H${x(bh)} v6`} fill="none" style={{ stroke: 'var(--ink-2)' }} strokeWidth={1.2} />
        <text x={x(1)} y={trackY - 28} textAnchor="middle" style={{ fill: 'var(--ink-2)' }}>FV ±{Math.round(v.bandPct * 100)}%</text>
        {pfv !== undefined && (
          <g>
            <line x1={x(pfv)} x2={x(pfv)} y1={trackY - 14} y2={trackY + 14} style={{ stroke: 'var(--ink)' }} strokeWidth={3} />
            {off && <path d={pfv > HI ? `M${x(HI) - 1},${trackY} l-7,-5 v10 z` : `M${x(LO) + 1},${trackY} l7,-5 v10 z`} style={{ fill: 'var(--ink)' }} />}
            <text
              x={x(pfv) + (pfv > 1.4 ? -8 : 8)} y={trackY + 4} textAnchor={pfv > 1.4 ? 'end' : 'start'}
              style={{ fill: 'var(--ink)', fontWeight: 600, fontSize: 12, paintOrder: 'stroke', stroke: 'var(--surface)', strokeWidth: 4 }}
            >
              {ratio(pfv)}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
