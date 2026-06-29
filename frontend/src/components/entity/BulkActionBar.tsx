import type { LucideIcon } from 'lucide-react'
import { ACTION_ICON } from '../../config/iconRegistry'
import { Icon } from '../primitives/Icon'
import { Divider } from '../primitives/Divider'

// The generic bulk-action bar (UX §8.6, FR-E-020) — ONE component, used on the ledger and the
// CategoryTree, extensible to any entity list. Presentational & controlled (props + callbacks, no
// useMultiSelect inside): the consuming page wires useMultiSelect → count/onClear and supplies the
// per-surface `actions`. Hidden at zero selection; slides up at ≥1. Position-agnostic — the consumer
// pins it (e.g. sticky to the bottom of the list region); the component itself is just the bar.

export interface BulkAction {
  id: string
  label: string
  icon?: LucideIcon
  onClick: () => void
  /** 'accent' → the non-mutating "Visualize / Open" treatment (§8.1). */
  tone?: 'default' | 'accent'
  /** Renders after the divider in the destructive cluster (text-error). */
  destructive?: boolean
  /** Greyed + not clickable (the per-item permission rule — a Member can't act on others' items). */
  disabled?: boolean
  disabledReason?: string
}

export interface BulkActionBarProps {
  count: number
  onClear: () => void
  actions: BulkAction[]
}

function ActionButton({ action }: { action: BulkAction }) {
  const { id, label, icon, onClick, tone, destructive, disabled, disabledReason } = action
  const toneClass = disabled
    ? 'text-text-muted border-border'
    : destructive
      ? 'text-error border-border'
      : tone === 'accent'
        ? 'text-accent border-border-accent'
        : 'text-text-strong border-border'
  return (
    <button
      type="button"
      data-testid={`bulk-action-${id}`}
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      className={`
        inline-flex h-control items-center gap-2xs whitespace-nowrap rounded-md border px-sm text-sm
        transition-colors duration-quick
        ${toneClass}
        ${disabled ? 'disabled' : 'hover:bg-surface-hover'}
      `}
    >
      {icon && <Icon icon={icon} size={14} aria-hidden />}
      {label}
    </button>
  )
}

export function BulkActionBar({ count, onClear, actions }: BulkActionBarProps) {
  if (count === 0) return null

  // Partition by destructive so destructive actions always land after the divider, regardless of the
  // caller's array order (mirrors the §8.1 ContextMenu destructive-grouping rule).
  const normal = actions.filter((a) => !a.destructive)
  const destructive = actions.filter((a) => a.destructive)

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      data-testid="bulk-action-bar"
      className="animate-slide-up flex flex-nowrap items-center gap-md overflow-x-auto rounded-lg border border-border bg-surface-overlay px-md py-sm shadow-lg"
    >
      <b className="whitespace-nowrap text-sm font-semibold">{count} selected</b>
      <button
        type="button"
        data-testid="bulk-clear"
        onClick={onClear}
        aria-label="Clear selection"
        className="inline-flex items-center gap-2xs whitespace-nowrap text-sm text-text-default transition-colors duration-quick hover:text-text-strong"
      >
        <Icon icon={ACTION_ICON.close} size={14} aria-hidden />
        Clear
      </button>
      {/* A divider precedes each non-empty cluster — so an empty/all-destructive `actions` array never
          leaves a dangling or doubled divider (the destructive divider below is likewise guarded). */}
      {normal.length > 0 && <Divider orientation="vertical" className="h-5" />}
      {normal.map((a) => (
        <ActionButton key={a.id} action={a} />
      ))}
      {destructive.length > 0 && <Divider orientation="vertical" className="h-5" />}
      {destructive.map((a) => (
        <ActionButton key={a.id} action={a} />
      ))}
    </div>
  )
}
