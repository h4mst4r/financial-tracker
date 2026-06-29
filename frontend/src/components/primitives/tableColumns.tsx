import { type ReactNode } from 'react'
import { ACTION_ICON } from '../../config/iconRegistry'
import { Checkbox } from './Checkbox'
import { DatePicker } from './DatePicker'
import { Input } from './Input'
import { ContextMenu, type ContextMenuEntry } from './ContextMenu'
import { Icon } from './Icon'
import { MonetaryValue } from './MonetaryValue'
import { DateValue } from './DateValue'
import type { ColumnDef } from './Table'

// Column vocabulary (§8.7) — the reuse unit. Date + money displays render through the §7 value atoms
// (DateValue / MonetaryValue, Story 5F.3). Remaining atom-bound columns are deferred to their story:
// statusColumn → StatusBadge (5f-4), categoryColumn → FilledChip / currency / account / person
// (Story 5.2). Each factory returns a ColumnDef<T> bundling display render + inline editControl.

export function dateColumn<T>(opts: {
  key: string
  header?: ReactNode
  get: (row: T) => string
  // Optional custom formatter (e.g. a fixed "d MMM"); defaults to the DateValue atom (per-person
  // display format, FR-P-009) — dates are never shown raw ISO (§7).
  format?: (iso: string) => string
  editable?: boolean
  width?: string
}): ColumnDef<T> {
  return {
    key: opts.key,
    header: opts.header ?? 'Date',
    align: 'left',
    width: opts.width,
    sortable: true,
    sortValue: opts.get,
    // Dates are TEXT (Inter), not mono — §7 reserves JetBrains Mono for money figures only.
    render: (row) =>
      opts.format ? opts.format(opts.get(row)) : <DateValue iso={opts.get(row)} />,
    editable: opts.editable,
    editInitial: opts.get,
    editControl: opts.editable
      ? ({ row, commit }) => <DatePicker value={opts.get(row)} onChange={(iso) => commit(iso)} />
      : undefined,
  }
}

export function textColumn<T>(opts: {
  key: string
  header: ReactNode
  get: (row: T) => string
  editable?: boolean
  placeholder?: string
  width?: string
  render?: (row: T) => ReactNode
  // Every data column is sortable (§12.2, owner decision 2026-06-23). Opt OUT with sortable:false.
  sortable?: boolean
}): ColumnDef<T> {
  return {
    key: opts.key,
    header: opts.header,
    align: 'left',
    width: opts.width,
    sortable: opts.sortable ?? true,
    sortValue: opts.get,
    render: opts.render ?? ((row) => opts.get(row)),
    editable: opts.editable,
    editInitial: opts.get,
    editControl: opts.editable
      ? ({ value, setValue }) => (
          <Input autoFocus value={value} placeholder={opts.placeholder} onChange={(e) => setValue(e.target.value)} />
        )
      : undefined,
  }
}

export function moneyColumn<T>(opts: {
  key: string
  header: ReactNode
  /** Raw decimal string (Decimal on the wire — never a float). */
  get: (row: T) => string
  currencyOf: (row: T) => string
  /** Household-configured symbol per row; falls back to the ISO narrow symbol. */
  symbolOf?: (row: T) => string
  /** Tint outflow red / inflow green by sign (§4/§12.1, bible .amt-out/.amt-in) via MonetaryValue. */
  signColour?: boolean
  editable?: boolean
  width?: string
}): ColumnDef<T> {
  return {
    key: opts.key,
    header: opts.header,
    align: 'right',
    width: opts.width,
    sortable: true,
    sortValue: (row) => Number(opts.get(row)),
    render: (row) => (
      <MonetaryValue
        amount={opts.get(row)}
        currency={opts.currencyOf(row)}
        symbol={opts.symbolOf?.(row)}
        variant="columnar"
        signColour={opts.signColour}
      />
    ),
    editable: opts.editable,
    editInitial: opts.get,
    // Amount-only editor (mono, right) — mirrors the 4.11 single-currency pilot. The amount+currency
    // MonetaryValueInput cell is the ledger's concern (5.2), passed as a custom editControl there.
    editControl: opts.editable
      ? ({ value, setValue, row }) => (
          <span className="flex items-center justify-end gap-2xs">
            <span className="shrink-0 text-2xs text-text-muted">{opts.currencyOf(row)}</span>
            <Input
              autoFocus
              inputMode="decimal"
              className="text-right font-mono"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </span>
        )
      : undefined,
  }
}

export function selectColumn<T>(opts: {
  isSelected: (row: T) => boolean
  onToggle: (row: T) => void
  rowLabel?: (row: T) => string
  width?: string
}): ColumnDef<T> {
  return {
    key: '__select',
    header: '',
    align: 'center',
    width: opts.width ?? '2.5rem',
    render: (row) => (
      <Checkbox
        checked={opts.isSelected(row)}
        onChange={() => opts.onToggle(row)}
        aria-label={opts.rowLabel ? `Select ${opts.rowLabel(row)}` : 'Select row'}
      />
    ),
  }
}

export function actionsColumn<T>(opts: {
  items: (row: T) => ContextMenuEntry[]
  width?: string
}): ColumnDef<T> {
  return {
    key: '__actions',
    header: '',
    align: 'right',
    width: opts.width ?? '2.5rem',
    render: (row) => (
      <ContextMenu
        trigger={<Icon icon={ACTION_ICON.more} size={14} className="text-text-muted opacity-60 hover:opacity-100" />}
        items={opts.items(row)}
      />
    ),
  }
}
