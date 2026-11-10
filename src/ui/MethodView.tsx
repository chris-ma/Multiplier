import { FACTORS } from '../engine/factors';
import { VERDICTS } from '../engine/value';

const SOURCES = [
  ['Business For Sale: The Ultimate Guide on How to Value a Business in 2026', 'https://www.businessforsale.com.au/business-advice/the-ultimate-guide-on-how-to-value-a-business-in-2026', 'AU multiples by industry and size, add-backs, lease, DSCR test'],
  ['BizBuySell: Risk Factors in Business Valuation', 'https://www.bizbuysell.com/learning-center/article/business-valuation-risk-factors/', 'Risk factor list'],
  ['BizBuySell Insight Report', 'https://www.bizbuysell.com/news/media_insight.html', 'Q2 2026 multiples and medians'],
  ['Viking Mergers: 9 Factors That Increase Business Valuation', 'https://www.vikingmergers.com/blog/factors-that-increase-business-valuation/', 'Concentration threshold, multiple spread'],
  ['Pioneer Buy-Side Brief', 'https://matthiassmith.kit.com/posts/the-pioneer-buy-side-brief-a-candid-look-at-what-s-actually-closing-in-the-sba-acquisition-market-in-2026', '2025 sale-to-asking ratio (secondary)'],
  ['BizBuySell Sacramento Q1 2026 snapshot', 'https://sendfox.com/lp/1r28z9/c/2d82nl/selling-a-business-in-sacramento-q1-2026-market-snapshot', 'Asking vs closed multiples (secondary)'],
];

export function MethodView() {
  return (
    <div className="stack-l" style={{ maxWidth: 900 }}>
      <div className="stack">
        <h1>Method</h1>
        <p className="ink2" style={{ margin: 0 }}>
          Fair value is weighted, normalised SDE multiplied by a base multiple that 13 risk factors push up or down, plus or minus balance-sheet items.
          Every listing is then expressed as Price-to-Fair-Value (P/FV) so over- and under-pricing is comparable across hundreds of listings.
        </p>
        <pre className="panel panel-b mono" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
FV = SDE_weighted × (M_base + Σ sᵢ·wᵢ) + Inventory + Assets_excess − CapEx_deferred{'\n'}
sᵢ ∈ [−2, +2], wᵢ = max swing ÷ 2. Multiple clamped to the sector range ±0.5x.
        </pre>
      </div>

      <div className="stack">
        <h2>Steps</h2>
        <ol className="ink2" style={{ margin: 0, paddingLeft: 20 }}>
          <li><b>Normalise SDE</b> per year: net profit + owner wage and super + add-backs − market-wage, market-rent and non-operating adjustments − maintenance capex.</li>
          <li><b>Weight three years</b>: rising 50/30/20 (latest first); volatile equal thirds or drop a documented abnormal year; falling latest × 0.9.</li>
          <li><b>Base multiple</b>: sector midpoint, replaced by the median of your sold comparables once a sector has 10 or more.</li>
          <li><b>Adjust and test</b>: add the 13 factor turns, clamp, apply hard overrides, then run the lender test (SDE − market owner wage ≥ 1.25 × debt service). Loss-making businesses fall back to asset value with zero goodwill.</li>
        </ol>
      </div>

      <div className="stack">
        <h2>Factors (v1 defaults)</h2>
        <div className="panel tablewrap">
          <table className="data">
            <thead><tr><th>#</th><th>Factor</th><th className="num">Max swing</th><th>−2</th><th>0</th><th>+2</th></tr></thead>
            <tbody>
              {FACTORS.map((f) => (
                <tr key={f.id} className="static">
                  <td className="mono">{f.num}</td><td>{f.name}</td><td className="num">{f.noUpside ? `0 to −${f.swing.toFixed(2)}` : `±${f.swing.toFixed(2)}`}</td>
                  <td className="ink2">{f.thresholds.m2}</td><td className="ink2">{f.thresholds.z}</td><td className="ink2">{f.thresholds.p2}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ margin: 0 }}>Scores of −1 and +1 sit at the midpoint between columns. Hard overrides: location-dependent with under 1 year of lease caps the multiple at the industry minimum; a material legal issue flags the record for review and widens the band to ±25%.</p>
      </div>

      <div className="stack">
        <h2>Verdict bands</h2>
        <div className="panel tablewrap">
          <table className="data">
            <thead><tr><th>P/FV</th><th>Verdict</th><th>Reading</th></tr></thead>
            <tbody>
              {VERDICTS.map((v) => (
                <tr key={v.id} className="static">
                  <td className="num" style={{ textAlign: 'left' }}>{v.from === -Infinity ? `Under ${v.to}` : v.to === Infinity ? `Over ${v.from}` : `${v.from} to ${v.to}`}</td>
                  <td><span className={`vtag v-${v.id}`}>{v.label}</span></td><td className="ink2">{v.reading}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ margin: 0 }}>A verdict is confirmed only when the price sits outside the fair value confidence range; otherwise it is shown hatched as "within margin of error".</p>
      </div>

      <div className="stack">
        <h2>Limitations</h2>
        <ul className="ink2" style={{ margin: 0, paddingLeft: 20 }}>
          <li>The output is an estimate for screening, not a formal valuation; it is not financial advice. Formal Australian valuations for tax follow the ATO's market valuation guidance and are done by a qualified valuer.</li>
          <li>Industry ranges come from broker-published rules of thumb, not a public register of Australian closed sales. Accuracy improves only as you load your own sold records.</li>
          <li>Factor weights are a proposed model. Back-test them: score your sold records, compare FV to actual sale price, and tune weights to minimise median absolute error.</li>
          <li>Freehold property, stock and excess assets are valued outside the multiple and must be entered separately.</li>
          <li>Postcode-derived location tiers are coarse approximations; enter <span className="mono">location_tier</span> where it matters.</li>
          <li>v1 covers Australian listings only. Currency is AUD; dates are stored as ISO and displayed in AEST.</li>
        </ul>
      </div>

      <div className="stack">
        <h2>Sources</h2>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {SOURCES.map(([t, u, n]) => <li key={u}><a href={u} target="_blank" rel="noreferrer">{t}</a> <span className="muted small">({n})</span></li>)}
        </ul>
      </div>
    </div>
  );
}
