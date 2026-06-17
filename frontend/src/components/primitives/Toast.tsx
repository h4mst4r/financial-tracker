import { type ReactNode } from 'react'
import { Info, Check, AlertTriangle, XCircle, X } from 'lucide-react'
import type { ToastVariant } from '../../stores/alertStore'

interface ToastProps {
  variant: ToastVariant
  message: ReactNode
  onDismiss: () => void
}

// Neutral surface + a semantic ICON CHIP (UX §0.1 — meaning via the icon, never a coloured
// accent bar or a bold semantic background).
const variantConfig: Record<ToastVariant, { icon: typeof Info; chip: string }> = {
  info: { icon: Info, chip: 'bg-info-fill text-info' },
  success: { icon: Check, chip: 'bg-success-fill text-success' },
  warning: { icon: AlertTriangle, chip: 'bg-warning-fill text-warning' },
  error: { icon: XCircle, chip: 'bg-error-fill text-error' },
}

export function Toast({ variant, message, onDismiss }: ToastProps) {
  const { icon: IconComponent, chip } = variantConfig[variant]

  return (
    <div
      role="alert"
      className="
        rounded-md shadow-lg px-md py-xs text-sm
        bg-surface-overlay border border-border text-text-primary
        flex items-center gap-sm
      "
    >
      <span className={`shrink-0 inline-flex items-center justify-center w-lg h-lg rounded-sm ${chip}`}>
        <IconComponent size={14} />
      </span>
      <span className="flex-1">{message}</span>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-text-secondary hover:text-text-primary transition-colors shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  )
}
