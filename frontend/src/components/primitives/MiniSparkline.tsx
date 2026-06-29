import type { CSSProperties } from 'react'
import { ACTION_ICON, CONTROL_ICON } from '../../config/iconRegistry'
import { Icon } from './Icon'
import { Skeleton } from './Skeleton'
import { VB_W, VB_H, PAD, MAX_POINTS, round2, sparkPoints, type Pt } from './sparkline'

// MiniSparkline (UX §9.2, FR-V-012) — the axis-less, label-less card mini-chart that fills EntityCard's
// `sparkline` slot. Line (area + line + end-dot) for continuous series, bars for discrete; optional ▲▼
// delta caption in SEMANTIC inflow/outflow colours (never the series colour). Colour comes entirely from
// var(--entity-colour) via the spark-* utilities — no literal hex — so it matches the card fill and remaps
// under immersive themes (the consumer sets the variable; the atom only reads it). The click→full-Viewer
// wiring is the Epic-9 seam: this ships only the `onExpand` affordance.

export interface MiniSparklineProps {
  /** The value series; the atom plots the last 12 points (fewer if fewer exist — never downsampled). */
  data: number[]
  /** `line` (default) for continuous series (account value, FX rate); `bar` for discrete/period series. */
  variant?: 'line' | 'bar'
  /** Sets --entity-colour inline (self-contained use); omit to inherit it from an ancestor (the card). */
  colour?: string
  /** Show the ▲▼ % delta vs the first visible point, in semantic inflow/outflow colours. Default off. */
  showDelta?: boolean
  /** Render a Skeleton sized to the sparkline footprint instead of the chart. */
  loading?: boolean
  /** Epic-9 Viewer seam: when set, renders a focusable expand affordance that calls this on activate. */
  onExpand?: () => void
  className?: string
  'aria-label'?: string
}

function LineSpark({ pts }: { pts: Pt[] }) {
  const linePoints = pts.map((p) => `${p.x},${p.y}`).join(' ')
  const area =
    `M${pts[0].x},${pts[0].y} ` +
    pts
      .slice(1)
      .map((p) => `L${p.x},${p.y}`)
      .join(' ') +
    ` L${VB_W},${VB_H} L0,${VB_H} Z`
  const last = pts[pts.length - 1]
  return (
    <>
      <path className="spark-area" d={area} />
      <polyline className="spark-line animate-spark-draw" pathLength={1} points={linePoints} />
      <circle className="spark-end" cx={last.x} cy={last.y} r="2.5" />
    </>
  )
}

function BarSpark({ values }: { values: number[] }) {
  const n = values.length
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min
  const innerH = VB_H - PAD * 2
  const slotW = VB_W / n
  const barW = slotW * 0.6
  return (
    <>
      {values.map((v, i) => {
        const t = span === 0 ? 0.5 : (v - min) / span
        const barH = PAD + t * innerH
        const x = i * slotW + (slotW - barW) / 2
        const isLast = i === n - 1
        // The most-recent bar is emphasised (full opacity); earlier bars recede (§9.2 latest-point emphasis).
        return (
          <rect
            key={i}
            className={`spark-bar ${isLast ? '' : 'opacity-60'}`}
            x={round2(x)}
            y={round2(VB_H - barH)}
            width={round2(barW)}
            height={round2(barH)}
          />
        )
      })}
    </>
  )
}

function DeltaCaption({ values }: { values: number[] }) {
  const first = values[0]
  const last = values[values.length - 1]
  const pct = first === 0 ? 0 : ((last - first) / Math.abs(first)) * 100
  const rounded = Math.round(pct * 10) / 10
  const tone = rounded > 0 ? 'text-success' : rounded < 0 ? 'text-error' : 'text-text-muted'
  return (
    <div data-testid="spark-delta" className={`mt-2xs flex items-center gap-2xs text-xs font-medium ${tone}`}>
      {rounded > 0 && <Icon icon={CONTROL_ICON.trendUp} size={12} />}
      {rounded < 0 && <Icon icon={CONTROL_ICON.trendDown} size={12} />}
      <span>
        {rounded > 0 ? '+' : ''}
        {rounded}%
      </span>
    </div>
  )
}

export function MiniSparkline({
  data,
  variant = 'line',
  colour,
  showDelta = false,
  loading = false,
  onExpand,
  className = '',
  'aria-label': ariaLabel = 'Value history sparkline',
}: MiniSparklineProps) {
  // The only inline --entity-colour write (self-contained use); otherwise the atom inherits it (§2.5).
  const style: CSSProperties | undefined = colour ? ({ '--entity-colour': colour } as CSSProperties) : undefined

  if (loading) {
    return (
      <div className={className} style={style}>
        <Skeleton variant="rect" className="h-sparkline w-full" />
      </div>
    )
  }

  const visible = data.slice(-MAX_POINTS)
  const hasChart = visible.length >= 2

  const content = (
    <>
      {hasChart ? (
        <svg
          className="spark h-sparkline w-full"
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={ariaLabel}
        >
          {variant === 'bar' ? <BarSpark values={visible} /> : <LineSpark pts={sparkPoints(visible)} />}
        </svg>
      ) : (
        // < 2 points: a muted placeholder in the same footprint — never a broken/empty chart (§9.2).
        <div
          data-testid="spark-empty"
          className="h-sparkline flex w-full flex-col items-center justify-center gap-2xs"
        >
          <div className="border-border w-full border-t" />
          <span className="text-text-muted text-xs">no history yet</span>
        </div>
      )}
      {showDelta && hasChart && <DeltaCaption values={visible} />}
    </>
  )

  // onExpand present → a focusable expand affordance (the Epic-9 Viewer seam). Absent → purely
  // presentational, so it can nest inside EntityCard's stretched open-button without a nested <button> (§2.6).
  if (onExpand) {
    return (
      <button
        type="button"
        onClick={onExpand}
        aria-label="Expand chart"
        style={style}
        className={`group/spark relative block w-full rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-glow-primary ${className}`}
      >
        {content}
        <span className="text-text-default pointer-events-none absolute right-0 top-0 opacity-0 transition-opacity duration-quick group-hover/spark:opacity-100 group-focus-visible/spark:opacity-100">
          <Icon icon={ACTION_ICON.expand} size={14} />
        </span>
      </button>
    )
  }

  return (
    <div className={className} style={style}>
      {content}
    </div>
  )
}
