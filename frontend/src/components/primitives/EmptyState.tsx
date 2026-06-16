import { type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Icon } from './Icon'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    // Cap lives on the centered container + the text is w-full. NB: must use `max-w-empty-state`,
    // NOT `max-w-sm` — in Tailwind v4 `max-w-sm` resolves against --spacing-sm (12px) and collapses
    // this whole column to one-word-per-line (see index.css). This was the recurring EmptyState bug.
    <div className="mx-auto max-w-empty-state flex flex-col items-center justify-center gap-sm py-xl text-center">
      {icon && (
        <Icon icon={icon} size={48} className="text-text-muted mb-sm" />
      )}
      <h3 className="text-lg font-medium text-text-secondary">{title}</h3>
      {description && (
        <p className="text-sm text-text-muted w-full">{description}</p>
      )}
      {action && <div className="mt-sm">{action}</div>}
    </div>
  )
}
