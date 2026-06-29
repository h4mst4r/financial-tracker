import { type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Icon } from './Icon'
import { Dot, type DotTone } from './Dot'

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

export function Badge({ variant = 'neutral', children, className = '', icon, dot }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-2xs rounded-sm px-xs py-2xs
        text-xs font-medium
        ${variantClasses[variant]}
        ${className}
      `}
    >
      {dot && <Dot tone={variantDot[variant]} />}
      {icon && <Icon icon={icon} size={12} aria-hidden />}
      {children}
    </span>
  )
}
