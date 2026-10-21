import { useState, type ReactNode } from 'react'
import { fmtDate, fmtMs, parseDateLocale } from '../lib/time'

export interface ChartPoint {
  id: string
  /** Date ISO (date seule ou horodatage). */
  date: string
  /** Temps en millisecondes (plus bas = mieux). */
  temps: number
}

/**
 * Graphique SVG d'évolution des temps : une série, axe y = temps (plus bas = mieux),
 * infobulle au toucher. `renderInfo` reçoit le point sélectionné et rend l'infobulle.
 */
export function Chart<P extends ChartPoint>({ points, renderInfo }: { points: P[]; renderInfo?: (p: P) => ReactNode }) {
  const [sel, setSel] = useState<number | null>(null)
  const W = 640
  const H = 260
  const m = { t: 16, r: 16, b: 36, l: 56 }
  const xs = points.map((p) => parseDateLocale(p.date).getTime())
  const ys = points.map((p) => p.temps)
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)
  const pad = Math.max((yMax - yMin) * 0.15, 500)
  const y0 = yMin - pad
  const y1 = yMax + pad
  const X = (v: number) => m.l + (x1 === x0 ? (W - m.l - m.r) / 2 : ((v - x0) / (x1 - x0)) * (W - m.l - m.r))
  const Y = (v: number) => m.t + ((v - y0) / (y1 - y0)) * (H - m.t - m.b)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(xs[i]).toFixed(1)},${Y(p.temps).toFixed(1)}`).join(' ')
  const bestIdx = ys.indexOf(yMin)
  const yTicks = 4
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => y0 + ((y1 - y0) * i) / yTicks)
  const s = sel != null ? points[sel] : null

  return (
    <div style={{ position: 'relative' }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Évolution des temps">
        {ticks.map((t, i) => (
          <g key={i}>
            <line className="axis" x1={m.l} x2={W - m.r} y1={Y(t)} y2={Y(t)} strokeDasharray={i === 0 || i === yTicks ? undefined : '2 4'} />
            <text className="tick" x={m.l - 6} y={Y(t) + 3} textAnchor="end">
              {fmtMs(t, { decimals: 2 })}
            </text>
          </g>
        ))}
        <text className="tick" x={m.l} y={H - 8}>
          {fmtDate(points[0].date)}
        </text>
        <text className="tick" x={W - m.r} y={H - 8} textAnchor="end">
          {fmtDate(points.at(-1)!.date)}
        </text>
        <path className="line" d={path} />
        {points.map((p, i) => (
          <g key={p.id} onClick={() => setSel(sel === i ? null : i)} style={{ cursor: 'pointer' }}>
            <circle cx={X(xs[i])} cy={Y(p.temps)} r={18} fill="transparent" />
            <circle className={`pt${i === bestIdx ? ' best' : ''}`} cx={X(xs[i])} cy={Y(p.temps)} r={sel === i ? 7 : 5} stroke="var(--bg-2)" strokeWidth={2} />
          </g>
        ))}
        <text className="tick" x={X(xs[bestIdx])} y={Y(yMin) + 18} textAnchor="middle" style={{ fill: 'var(--ok)', fontWeight: 700 }}>
          {fmtMs(yMin)}
        </text>
      </svg>
      {s && renderInfo && (
        <div className="notice" style={{ marginTop: 6 }}>
          {renderInfo(s)}
        </div>
      )}
    </div>
  )
}
