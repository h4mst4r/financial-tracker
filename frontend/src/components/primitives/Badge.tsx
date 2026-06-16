import { type ReactNode } from 'react'

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'info' | 'error'

interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  neutral: 'bg-surface-active text-text-secondary',
  success: 'bg-success-fill text-success',
  warning: 'bg-warning-fill text-warning',
  info: 'bg-info-fill text-info',
  error: 'bg-error-fill text-error',
}

export function Badge({ variant = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center rounded-sm px-xs py-2xs
        text-xs font-medium
        ${variantClasses[variant]}
        ${className}
      `}
    >
      {children}
    </span>
  )
}
