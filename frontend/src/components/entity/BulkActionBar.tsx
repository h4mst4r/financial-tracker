import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { ACTION_ICON } from '../../config/iconRegistry'
import { Icon } from '../primitives/Icon'
import { Divider } from '../primitives/Divider'
import { Dropdown } from '../primitives/Dropdown'

// The generic bulk-action bar (UX §8.6, FR-E-020) — ONE component, used on the ledger and the
// CategoryTree, extensible to any entity list. Presentational & controlled (props + callbacks, no
// useMultiSelect inside): the consuming page wires useMultiSelect → count/onClear and supplies the
// per-surface `actions`. Hidden at zero selection; slides up at ≥1. Position-agnostic — the consumer
// pins it (e.g. sticky to the bottom of the list region); the component itself is just the bar.
//
// An action is a **Button** OR an **inline picker** (UX §8.6 lines 556/602: a single-target pick —
// Categories Edit-type / Move / Merge — is a `Dropdown`/`SegmentedControl` the bar owns *inline*; there
// is NO separate "bulk chooser" modal). A *destructive* pick (Merge) routes its confirmation to the
// consumer's `ConfirmationDialog` via `onPick` — the bar selects, the consumer confirms.

interface BulkActionBase {
  id: string
  label: string
  /** Renders after the divider in the destructive cluster (text-error for buttons). */
  destructive?: boolean
  /** Greyed + not interactive (the per-item permission rule — a Member can't act on others' items). */
  disabled?: boolean
  disabledReason?: string
}

export interface BulkActionButton extends BulkActionBase {
  kind?: 'button'
  icon?: LucideIcon
  onClick: () => void
  /** 'accent' → the non-mutating "Visualize / Open" treatment (§8.1). */
  tone?: 'default' | 'accent'
}

export interface BulkActionPicker extends BulkActionBase {
  kind: 'picker'
  /** Inline single-target options (UX §8.6); `label` is the trigger placeholder ("Edit type", "Move to…"). */
  options: { value: string; label: ReactNode; searchText?: string }[]
  /** Fired on pick. A non-destructive pick applies directly; a destructive pick (Merge) opens the
   *  consumer's ConfirmationDialog. */
  onPick: (value: string) => void
  searchable?: boolean
}

export type BulkAction = BulkActionButton | BulkActionPicker

export interface BulkActionBarProps {
  count: number
  onClear: () => void
  actions: BulkAction[]
}

function isPicker(a: BulkAction): a is BulkActionPicker {
  return a.kind === 'picker'
}

function ActionButton({ action }: { action: BulkActionButton }) {
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

// The inline single-target picker (UX §8.6) — a fixed-width Dropdown the bar owns. `value=""` always, so
// it never persists a selection: each pick fires `onPick` and the trigger resets to the placeholder.
function ActionPicker({ action }: { action: BulkActionPicker }) {
  const { id, label, options, onPick, searchable, disabled, disabledReason } = action
  return (
    <span title={disabled ? disabledReason : undefined} className="w-bulk-picker shrink-0">
      <Dropdown
        data-testid={`bulk-action-${id}`}
        value=""
        placeholder={label}
        options={options}
        onChange={onPick}
        disabled={disabled}
        searchable={searchable}
      />
    </span>
  )
}

function ActionItem({ action }: { action: BulkAction }) {
  return isPicker(action) ? <ActionPicker action={action} /> : <ActionButton action={action} />
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
      className="animate-slide-up flex flex-nowrap items-center gap-sm overflow-x-auto rounded-lg border border-border bg-surface-overlay px-md py-sm shadow-lg max-md:w-full"
    >
      <b className="whitespace-nowrap text-sm font-semibold">{count} selected</b>
      {/* Clear = a ghost ICON button (the `×` glyph only), per UX line 530 — no text label. The label
          lives in aria-label for screen readers. */}
      <button
        type="button"
        data-testid="bulk-clear"
        onClick={onClear}
        aria-label="Clear selection"
        className="inline-flex shrink-0 items-center justify-center rounded-md p-2xs text-text-default transition-colors duration-quick hover:bg-surface-hover hover:text-text-strong"
      >
        <Icon icon={ACTION_ICON.close} size={14} aria-hidden />
      </button>
      {/* A divider precedes each non-empty cluster — so an empty/all-destructive `actions` array never
          leaves a dangling or doubled divider (the destructive divider below is likewise guarded). */}
      {normal.length > 0 && <Divider orientation="vertical" className="h-5" />}
      {normal.map((a) => (
        <ActionItem key={a.id} action={a} />
      ))}
      {destructive.length > 0 && <Divider orientation="vertical" className="h-5" />}
      {destructive.map((a) => (
        <ActionItem key={a.id} action={a} />
      ))}
    </div>
  )
}
