import { type CSSProperties, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Icon } from './Icon'
import { Dot, type DotTone } from './Dot'
import { useEntityColour } from '../../theme/useEntityColour'

// `success`/`warning`/`info`/`error` are the §4 semantic tones (resolved from the status registry via
// BADGE_VARIANT_FOR_TONE); `neutral`/`outline` are the non-semantic tones (e.g. roles, currency code —
// UX §328). The §5 **entity** tone is not a variant — it is the `entityColor` prop below.
export type BadgeVariant = 'neutral' | 'outline' | 'success' | 'warning' | 'info' | 'error'

interface BadgeProps {
  variant?: BadgeVariant
  /** Optional — an icon-only badge (the Toast semantic chip) omits children. */
  children?: ReactNode
  className?: string
  /** Leading glyph (UX line 393 "+ Icon") — e.g. an alert-type or category glyph. */
  icon?: LucideIcon
  /** Leading status `Dot` (UX line 393 "+ opt Dot") — tinted to match the badge variant; the
   *  StatusBadge "ledger dot" form (§4) folded into Badge. */
  dot?: boolean
  /** §5 **entity** variant (UX §397 "§4 status / §5 entity / neutral") — a colour-led chip tinted to a
   *  per-instance entity colour (Category / Account, §153). The colour is data (like the Dot legend /
   *  ColourPicker swatch); it is **resolved via `useEntityColour`** (the SCP 2026-06-22 seam) so it
   *  immersive-ramp-snaps + honours the §0.11 floor, then drives `--entity-colour` on the entity-axis
   *  fill/text (`bg-entity-fill-calm` + `text-entity-fg`), never raw hex on the text. Overrides `variant`. */
  entityColor?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  neutral: 'bg-surface-active text-text-default',
  outline: 'bg-transparent border border-border-strong text-text-default',
  success: 'bg-success-fill text-success',
  warning: 'bg-warning-fill text-warning',
  info: 'bg-info-fill text-info',
  error: 'bg-error-fill text-error',
}

// The Dot tone that matches each badge variant (a status badge's leading dot reads in the same hue).
const variantDot: Record<BadgeVariant, DotTone> = {
  neutral: 'neutral',
  outline: 'neutral',
  success: 'positive',
  warning: 'warning',
  info: 'info',
  error: 'critical',
}

export function Badge({ variant = 'neutral', children, className = '', icon, dot, entityColor }: BadgeProps) {
  // §5 entity chip: resolve the per-instance colour through the SCP seam (immersive ramp-snap + §0.11
  // floor — CSS can't theme an arbitrary hex), then drive --entity-colour on the entity-axis fill/text.
  // `useEntityColour(undefined)` → undefined, so a semantic/neutral/outline Badge is unchanged.
  const resolved = useEntityColour(entityColor)
  const toneClass = resolved ? 'bg-entity-fill-calm text-entity-fg' : variantClasses[variant]
  return (
    <span
      style={resolved ? ({ '--entity-colour': resolved.colour } as CSSProperties) : undefined}
      className={`
        inline-flex items-center gap-2xs rounded-sm px-xs py-2xs
        text-xs font-medium
        ${toneClass}
        ${className}
      `}
    >
      {dot && <Dot tone={variantDot[variant]} />}
      {icon && <Icon icon={icon} size={12} aria-hidden />}
      {children}
    </span>
  )
}
