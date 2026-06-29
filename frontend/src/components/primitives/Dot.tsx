import type { CSSProperties } from 'react'
import type { StatusTone } from '../../config/statusRegistry'

// Dot (UX Layer-2 atom · line 394) — a tiny filled circle. Three uses, one atom:
//   • status → a §4 semantic tone (consume a tone from the statusRegistry, never a colour);
//   • unread / new → the `accent` tone (§6);
//   • chart legend → an arbitrary viz-series `color` (the one case a raw colour is correct — series
//     colours are data, like the ColourPicker swatch hexes, applied via inline style).
// People = circles too, but a person is an `Avatar`, never a Dot (§5).

export type DotTone = StatusTone | 'accent'

// §4 tones (+ accent) → the solid fill utility. Each is a theme token, so the dot re-skins per palette.
const TONE_BG: Record<DotTone, string> = {
  positive: 'bg-success-solid',
  warning: 'bg-warning-solid',
  critical: 'bg-error-solid',
  info: 'bg-info-solid',
  neutral: 'bg-border-strong',
  accent: 'bg-accent-solid',
}

export interface DotProps {
  /** A §4 status tone or `accent` (unread/new). Ignored when `color` is set (legend series). */
  tone?: DotTone
  /** A chart-legend series colour (data) — applied via inline style; overrides `tone`. */
  color?: string
  className?: string
  'data-testid'?: string
}

export function Dot({ tone = 'neutral', color, className = '', 'data-testid': testId }: DotProps) {
  return (
    <span
      data-testid={testId}
      aria-hidden
      className={`inline-block size-2 shrink-0 rounded-full ${color ? '' : TONE_BG[tone]} ${className}`}
      style={color ? ({ backgroundColor: color } as CSSProperties) : undefined}
    />
  )
}
