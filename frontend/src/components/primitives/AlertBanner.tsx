import { type ReactNode } from 'react'
import { Icon } from './Icon'
import { STATUS_ICON } from '../../config/iconRegistry'
import type { StatusTone } from '../../config/statusRegistry'

// AlertBanner (UX §18 / Containers): an inline, full-width semantic notice — the §18 `stale` data-state
// surface (FX rates / FX-derived aggregates lagging behind live data). It CONSUMES a §4 tone and renders
// the §3 tint for that tone (the same fill tokens Badge uses) + the §11 registry glyph (STATUS_ICON) —
// it never authors a hue (L6) or imports a glyph (L14). Body text is §2 `default` (not the tone colour,
// for legibility on the tint); the icon carries the tone colour. No left bar (bible #alertbanner).
//
// `stale` ⇒ tone `warning` (UX §4). Built ahead of its live consumer (P6) — wired in its Epic-3/9 home.

interface AlertBannerProps {
  /** The §4 semantic tone — drives the §3 tint background + the §11 status glyph. `stale` = `warning`. */
  tone: StatusTone
  /** Optional emphasised lead line (§2 `strong`). */
  title?: string
  /** The notice body (§2 `default`). */
  children: ReactNode
  /** Optional trailing action — typically a `Button` (e.g. Retry / Refresh). */
  action?: ReactNode
  className?: string
}

// §4 tone → §3 tint fill + the tone's own colour (applied to the icon via currentColor). Mirrors Badge's
// tone→tint so the two surfaces stay in lockstep. `neutral` carries no glyph (STATUS_ICON.neutral = null).
const TONE_SURFACE: Record<StatusTone, string> = {
  positive: 'bg-success-fill text-success',
  warning: 'bg-warning-fill text-warning',
  critical: 'bg-error-fill text-error',
  info: 'bg-info-fill text-info',
  neutral: 'bg-surface-active text-text-default',
}

export function AlertBanner({ tone, title, children, action, className = '' }: AlertBannerProps) {
  const glyph = STATUS_ICON[tone]
  return (
    <div
      role="status"
      className={`flex items-center gap-sm rounded-md px-md py-sm text-sm ${TONE_SURFACE[tone]} ${className}`}
    >
      {glyph && <Icon icon={glyph} size={18} className="shrink-0" />}
      <div className="flex-1 text-text-default">
        {title && <p className="font-medium text-text-strong">{title}</p>}
        {children}
      </div>
      {action}
    </div>
  )
}
