import { useState, useRef, type ReactNode } from 'react'
import { ACTION_ICON, CONTROL_ICON } from '../../config/iconRegistry'
import { Icon } from './Icon'
import { Portal } from './behaviors/Portal'
import { usePopover } from './behaviors/usePopover'
import { useAnchoredPosition } from './behaviors/useAnchoredPosition'
import { Input } from './Input'
import { Dropdown } from './Dropdown'
import { SegmentedControl } from './SegmentedControl'
import { DatePicker } from './DatePicker'
import { Badge } from './Badge'
import { formatDateDisplay } from '../../lib/date'
import {
  defaultValue,
  anyActive,
  activeFilterCount,
  clearState,
  type FilterDescriptor,
  type FilterState,
  type FilterValue,
  type DateRangeValue,
  type DatePreset,
} from './filterBarLogic'

// FilterBar — the ONE filter row (UX §1.2a, bible #filterbar). This story (5.0d) ships the record-list
// profile only: descriptor-driven control layout, the responsive collapse into the "Filters" overflow
// popover, clear-all, the active-count badge, and serialize-to-VisualizationFilter (the pure layer). The
// bar owns the query row and NOTHING else — options + active state come from the caller / useEntityManager,
// the list from Table, rich edit from EntityModal (the §1.2a boundary that stops it re-absorbing surfaces).
// The aggregation profile (Viewer control bar) = Epic 9; bespoke-surface migration = Story 5.12.

export type {
  FilterDescriptor,
  FilterState,
  FilterValue,
  FilterOption,
  FilterControl,
  DateRangeValue,
  DatePreset,
  VizField,
} from './filterBarLogic'

export interface FilterBarProps {
  descriptors: FilterDescriptor[]
  value: FilterState
  onChange: (next: FilterState) => void
  /** Reset all filters. Omit → FilterBar clears to descriptor defaults via `onChange`. */
  onClear?: () => void
  className?: string
}

// Picker trigger button — the §2.1 pattern (mirrors Dropdown/DatePicker triggers); no bespoke style.
const TRIGGER_CLS =
  'h-control px-sm rounded-md text-sm bg-surface-raised border border-border text-text-strong ' +
  'flex items-center gap-2xs whitespace-nowrap hover:border-border-light focus:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-glow-primary'

const PRESET_LABELS: Record<DatePreset, string> = {
  month: 'This month',
  quarter: 'This quarter',
  year: 'This year',
  all_time: 'All time',
  custom: 'Custom',
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
function ymd(y: number, month1: number, day: number): string {
  return `${y}-${pad(month1)}-${pad(day)}`
}
// Concrete start/end for a relative preset (UI-time only — the pure serializer just reads these).
function presetRange(preset: DatePreset): { start?: string; end?: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() // 0-based
  const lastDay = (yy: number, m0: number) => new Date(yy, m0 + 1, 0).getDate()
  switch (preset) {
    case 'month':
      return { start: ymd(y, m + 1, 1), end: ymd(y, m + 1, lastDay(y, m)) }
    case 'quarter': {
      const q0 = Math.floor(m / 3) * 3
      return { start: ymd(y, q0 + 1, 1), end: ymd(y, q0 + 3, lastDay(y, q0 + 2)) }
    }
    case 'year':
      return { start: ymd(y, 1, 1), end: ymd(y, 12, 31) }
    default:
      return {}
  }
}
function rangeLabel(v: DateRangeValue): string {
  if (v.preset === 'custom' && v.start && v.end) return `${formatDateDisplay(v.start)} → ${formatDateDisplay(v.end)}`
  return PRESET_LABELS[v.preset]
}

// Anchored portal popover — the existing ContextMenu anchoring pattern (portal + getBoundingClientRect +
// scroll/resize reposition + outside-click/Esc dismiss). ponytail: this is the seam for the headless
// `Popover` behavior (Story 5f-1) — it recomposes this panel; the anchoring lives here only.
function AnchoredPanel({
  triggerContent,
  ariaLabel,
  triggerClassName,
  panelClassName,
  children,
}: {
  triggerContent: ReactNode
  ariaLabel: string
  triggerClassName?: string
  panelClassName?: string
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const close = () => setOpen(false)
  // Anchoring (portal + reposition + flip) is the shared Popover behavior — one implementation (L0).
  const pos = useAnchoredPosition(open, triggerRef, panelRef)

  // Popover behavior: outside-click + Escape dismissal. The panel is portalled, so the trigger (a
  // separate DOM subtree) is passed as a second "inside" element — a press on it must not dismiss. A
  // click INSIDE the panel (incl. an inner Dropdown/DatePicker popup, a DOM descendant of panelRef)
  // keeps it open (the 5.0a blur-within lesson, by containment). Escape additionally refocuses the
  // trigger; an outside-click does not.
  usePopover({
    open,
    onClose: close,
    onEscape: () => {
      close()
      triggerRef.current?.focus()
    },
    containRef: panelRef,
    triggerRef,
  })

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={triggerClassName ?? TRIGGER_CLS}
        onClick={() => setOpen((o) => !o)}
      >
        {triggerContent}
      </button>
      {open && (
        <Portal>
          <div
            ref={panelRef}
            role="dialog"
            aria-label={ariaLabel}
            className={`fixed z-popover bg-surface-raised border border-border rounded-md shadow-md p-sm ${panelClassName ?? ''}`}
            style={{ left: pos.x, top: pos.y }}
          >
            {children(close)}
          </div>
        </Portal>
      )}
    </>
  )
}

function DateRangeControl({ value, onChange }: { value: DateRangeValue; onChange: (v: DateRangeValue) => void }) {
  const presets: DatePreset[] = ['month', 'quarter', 'year', 'all_time', 'custom']
  return (
    <AnchoredPanel
      ariaLabel="Date range"
      panelClassName="min-w-menu"
      triggerContent={
        <>
          <Icon icon={CONTROL_ICON.calendar} size={14} />
          {rangeLabel(value)}
          <span className="text-text-muted">▾</span>
        </>
      }
    >
      {(close) => (
        <div className="flex flex-col gap-2xs">
          {presets.map((p) => {
            const active = value.preset === p
            return (
              <button
                key={p}
                type="button"
                className={`text-left px-sm py-xs rounded-md text-sm hover:bg-surface-active ${active ? 'bg-control-active text-primary' : 'text-text-default'}`}
                onClick={() => {
                  if (p === 'custom') {
                    onChange({ preset: 'custom', start: value.start, end: value.end })
                  } else {
                    onChange({ preset: p, ...presetRange(p) })
                    close()
                  }
                }}
              >
                {PRESET_LABELS[p]}
              </button>
            )
          })}
          {value.preset === 'custom' && (
            <div className="flex flex-col gap-2xs pt-2xs border-t border-border">
              <DatePicker value={value.start ?? ''} placeholder="Start" onChange={(iso) => onChange({ ...value, preset: 'custom', start: iso })} />
              <DatePicker value={value.end ?? ''} placeholder="End" onChange={(iso) => onChange({ ...value, preset: 'custom', end: iso })} />
            </div>
          )}
        </div>
      )}
    </AnchoredPanel>
  )
}

// Multi-value popover control (tags). ponytail: this is the seam for the `MultiSelectField` atom
// (Story 5.10) — selected values as removable chips + a Dropdown to add one. Value is string[].
function MultiChipsControl({
  descriptor,
  value,
  onChange,
}: {
  descriptor: FilterDescriptor
  value: string[]
  onChange: (v: string[]) => void
}) {
  const opts = descriptor.options ?? []
  const available = opts.filter((o) => !value.includes(o.value))
  const labelFor = (val: string) => opts.find((o) => o.value === val)?.label ?? val
  return (
    <div className="flex flex-wrap items-center gap-2xs">
      {value.map((v) => (
        <Badge key={v} variant="info" className="gap-2xs">
          {labelFor(v)}
          <button type="button" aria-label={`Remove ${labelFor(v)}`} className="hover:text-text-strong" onClick={() => onChange(value.filter((x) => x !== v))}>
            <Icon icon={ACTION_ICON.close} size={12} />
          </button>
        </Badge>
      ))}
      <Dropdown value="" options={available} placeholder="Add tag…" onChange={(val) => val && onChange([...value, val])} />
    </div>
  )
}

function FilterControl({
  descriptor,
  value,
  onChange,
}: {
  descriptor: FilterDescriptor
  value: FilterValue
  onChange: (v: FilterValue) => void
}) {
  switch (descriptor.control) {
    case 'search':
      return (
        <span className="relative flex items-center">
          <Icon icon={ACTION_ICON.search} size={14} className="absolute left-sm text-text-muted pointer-events-none" />
          <Input
            className="w-filter-search pl-xl"
            placeholder={descriptor.placeholder ?? 'Search…'}
            value={value as string}
            onChange={(e) => onChange(e.target.value)}
          />
        </span>
      )
    case 'dateRange':
      return <DateRangeControl value={value as DateRangeValue} onChange={onChange} />
    case 'dropdown':
      return (
        <Dropdown
          value={value as string}
          options={descriptor.options ?? []}
          searchable={descriptor.searchable}
          placeholder={descriptor.placeholder ?? descriptor.label}
          onChange={onChange}
        />
      )
    case 'segmented':
      return <SegmentedControl value={value as string} options={descriptor.options ?? []} onChange={onChange} />
    case 'popover':
      return descriptor.multi ? (
        <MultiChipsControl descriptor={descriptor} value={value as string[]} onChange={onChange} />
      ) : (
        <Dropdown
          value={value as string}
          options={descriptor.options ?? []}
          searchable={descriptor.searchable}
          placeholder={descriptor.label}
          onChange={onChange}
        />
      )
  }
}

// A labelled overflow control (the Filters popover grid cell): tiny label above the control.
function OverflowField({ descriptor, value, onChange }: { descriptor: FilterDescriptor; value: FilterValue; onChange: (v: FilterValue) => void }) {
  // A <div> (not <label>) — the controls are <button>-based (Dropdown/SegmentedControl/chips), and a
  // <label> would forward caption clicks to the first inner button (open a dropdown / hit a chip's ×).
  return (
    <div className="flex flex-col gap-2xs">
      <span className="text-2xs font-medium text-text-muted">{descriptor.label}</span>
      <FilterControl descriptor={descriptor} value={value} onChange={onChange} />
    </div>
  )
}

export function FilterBar({ descriptors, value, onChange, onClear, className = '' }: FilterBarProps) {
  const setKey = (key: string, v: FilterValue) => onChange({ ...value, [key]: v })
  const valueOf = (d: FilterDescriptor): FilterValue => value[d.key] ?? defaultValue(d)

  // Placement: search/dateRange stay inline at every width; other `primary` controls (Category, type) are
  // inline ≥ md and fold into the Filters popover < md; non-primary controls live in the popover always.
  const alwaysInline = descriptors.filter((d) => d.control === 'search' || d.control === 'dateRange')
  const mdInline = descriptors.filter((d) => d.primary && d.control !== 'search' && d.control !== 'dateRange')
  const overflow = descriptors.filter((d) => !d.primary && d.control !== 'search' && d.control !== 'dateRange')

  const hasFilters = mdInline.length > 0 || overflow.length > 0
  const overflowCount = activeFilterCount(value, overflow)
  const showClear = anyActive(value, descriptors)
  const clear = () => (onClear ? onClear() : onChange(clearState(descriptors)))

  return (
    <div data-testid="filter-bar" className={`flex items-center gap-xs flex-wrap ${className}`}>
      {alwaysInline.map((d) => (
        <FilterControl key={d.key} descriptor={d} value={valueOf(d)} onChange={(v) => setKey(d.key, v)} />
      ))}

      {/* Primary non-search/date controls (Category, type): inline ≥ md, folded into Filters < md. */}
      {mdInline.map((d) => (
        <span key={d.key} className="hidden md:flex">
          <FilterControl descriptor={d} value={valueOf(d)} onChange={(v) => setKey(d.key, v)} />
        </span>
      ))}

      {hasFilters && (
        <AnchoredPanel
          ariaLabel="Filters"
          triggerClassName={TRIGGER_CLS}
          panelClassName="w-filter-popover"
          triggerContent={
            <>
              <Icon icon={CONTROL_ICON.filters} size={14} />
              Filters
              {overflowCount > 0 && <Badge variant="info">{overflowCount}</Badge>}
            </>
          }
        >
          {() => (
            <div className="flex flex-col gap-sm">
              {/* < md: the primary Category/type controls also live here (their inline copies are hidden). */}
              {mdInline.length > 0 && (
                <div className="md:hidden grid grid-cols-2 gap-sm">
                  {mdInline.map((d) => (
                    <OverflowField key={d.key} descriptor={d} value={valueOf(d)} onChange={(v) => setKey(d.key, v)} />
                  ))}
                </div>
              )}
              {overflow.length > 0 && (
                <div className="grid grid-cols-2 gap-sm">
                  {overflow.map((d) => (
                    <OverflowField key={d.key} descriptor={d} value={valueOf(d)} onChange={(v) => setKey(d.key, v)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </AnchoredPanel>
      )}

      {showClear && (
        <button type="button" className="ml-auto text-sm text-text-default hover:text-text-strong" onClick={clear}>
          Clear all
        </button>
      )}
    </div>
  )
}
