import { type ReactNode } from 'react'
import { Icon } from './Icon'
import { STATUS_ICON, ACTION_ICON } from '../../config/iconRegistry'
import type { StatusTone } from '../../config/statusRegistry'
import type { ToastVariant } from '../../stores/alertStore'

interface ToastProps {
  variant: ToastVariant
  message: ReactNode
  onDismiss: () => void
}

// Neutral surface + a semantic ICON CHIP (UX §0.1 — meaning via the icon, never a coloured
// accent bar or a bold semantic background). The glyph is the §4 status-tone glyph (icon registry,
// §11 STATUS_ICON); the toast variant maps to a tone so the icon choice isn't picked here.
const VARIANT_TONE: Record<ToastVariant, StatusTone> = {
  info: 'info',
  success: 'positive',
  warning: 'warning',
  error: 'critical',
}
const variantChip: Record<ToastVariant, string> = {
  info: 'bg-info-fill text-info',
  success: 'bg-success-fill text-success',
  warning: 'bg-warning-fill text-warning',
  error: 'bg-error-fill text-error',
}

export function Toast({ variant, message, onDismiss }: ToastProps) {
  const glyph = STATUS_ICON[VARIANT_TONE[variant]]
  const chip = variantChip[variant]

  return (
    <div
      role="alert"
      className="
        rounded-md shadow-lg px-md py-xs text-sm
        bg-surface-overlay border border-border text-text-strong
        flex items-center gap-sm
      "
    >
      <span className={`shrink-0 inline-flex items-center justify-center w-lg h-lg rounded-sm ${chip}`}>
        {glyph && <Icon icon={glyph} size={14} />}
      </span>
      <span className="flex-1">{message}</span>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-text-default hover:text-text-strong transition-colors shrink-0"
      >
        <Icon icon={ACTION_ICON.close} size={14} />
      </button>
    </div>
  )
}
