import { forwardRef, type ReactNode } from 'react'

// Zone / Info-box (UX Layer-2 "Zone" · §10 dashed/solid · §3/§4 tint) — the ONE primitive for a
// bordered, optionally-tinted callout box: Settings "Danger zone" (§4 error hue) and the "Bank
// connections" coming-soon placeholder, plus drag drop-targets (the CategoryTree promote zone).
// Presentational: the consumer composes the inner content and supplies layout/size via `className`.
//
// A **dashed border belongs to a Zone** (or the archived-entity treatment) — never to an interactable
// (buttons/triggers use the ghost-fill treatment instead). This primitive is where dashed lives.

type ZoneTone = 'neutral' | 'error'

export interface ZoneProps {
  /** §3/§4 tint: a neutral surface, or the error (danger) hue. */
  tone?: ZoneTone
  /** §10 border style. */
  border?: 'solid' | 'dashed'
  /** Dim the whole zone (a "Coming soon" placeholder). Container dimming, not text emphasis (L3-safe). */
  dimmed?: boolean
  /** Highlighted target state (a drag-over drop zone) — the §6 solid accent-primary ring + fill. */
  active?: boolean
  className?: string
  children?: ReactNode
  'data-testid'?: string
}

const TONE: Record<ZoneTone, string> = {
  neutral: 'border-border bg-surface text-text-default',
  error: 'border-border-error bg-error-fill text-error',
}

// The drag-over / target highlight = the §6 solid accent-primary ring (vs the accent-secondary selection
// ring), with the primary-muted fill + strong text. Overrides the resting tone while active.
const ACTIVE = 'border-border-strong bg-primary-muted text-text-strong ring-2 ring-primary'

export const Zone = forwardRef<HTMLDivElement, ZoneProps>(function Zone(
  { tone = 'neutral', border = 'solid', dimmed = false, active = false, className = '', children, 'data-testid': testId },
  ref,
) {
  return (
    <div
      ref={ref}
      data-testid={testId}
      className={`
        rounded-md border transition-colors duration-quick
        ${border === 'dashed' ? 'border-dashed' : ''}
        ${active ? ACTIVE : TONE[tone]}
        ${dimmed ? 'opacity-60' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  )
})
