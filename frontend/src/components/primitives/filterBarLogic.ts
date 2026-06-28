// Pure decision logic + descriptor types for the FilterBar primitive (UX §1.2a) — no React, no DOM, so
// it is unit-testable in isolation (Story 5.0d AC3). The FilterBar component is a thin wrapper over these
// functions. Types live here (not in FilterBar.tsx) so the pure layer owns them and the component
// re-exports — mirrors tableLogic.ts owning SortState (Story 5.0a).

import type { VisualizationFilter } from '../../types/visualization'

export type FilterControl = 'search' | 'dateRange' | 'dropdown' | 'segmented' | 'popover'

/** The dateRange value shape. `start`/`end` are ISO `yyyy-mm-dd`; absent for the `all_time` preset. */
export type DatePreset = VisualizationFilter['time_range']['preset']
export interface DateRangeValue {
  preset: DatePreset
  start?: string
  end?: string
}

/** A control's active value: string (search/dropdown/segmented), string[] (multi popover), or a range. */
export type FilterValue = string | string[] | DateRangeValue

export interface FilterOption {
  value: string
  label: string
}

/** The VisualizationFilter field a descriptor projects into. Omit for ledger-only filters (status / gst /
 *  reconciled) — they live in FilterState but are NOT part of the viz projection (§4.12 has no such field). */
export type VizField =
  | 'time_range'
  | 'category_ids'
  | 'account_ids'
  | 'person_ids'
  | 'tag_ids'
  | 'transaction_type'

/** The reuse unit (§1.2a) — surfaces share descriptors, not "the bar". */
export interface FilterDescriptor {
  key: string
  label: string
  control: FilterControl
  options?: FilterOption[]
  placeholder?: string
  searchable?: boolean
  /** Stays in the main row at all widths (search/dateRange/lead Category/type). Non-primary → Filters popover. */
  primary?: boolean
  /** A `popover` control holding multiple values (value is string[], e.g. tags). */
  multi?: boolean
  /** The VisualizationFilter field this descriptor serialises into; omit for ledger-only filters. */
  toVizField?: VizField
}

export type FilterState = Record<string, FilterValue>

// all_time spans everything; concrete deterministic sentinels keep serializeToVisualizationFilter PURE
// (no `Date.now()`), so the projection is unit-testable.
const ALL_TIME_START = new Date(0)
const ALL_TIME_END = new Date('2999-12-31T00:00:00.000Z')

/** The "no filter" value for a descriptor's control (clear-all / initial state target). */
export function defaultValue(d: FilterDescriptor): FilterValue {
  switch (d.control) {
    case 'search':
    case 'dropdown':
      return ''
    case 'segmented':
      return d.options?.[0]?.value ?? '' // first segment is the default (e.g. 'all')
    case 'dateRange':
      return { preset: 'all_time' }
    case 'popover':
      return d.multi ? [] : ''
  }
}

/** Is a descriptor's value a non-default (active) filter? Drives clear-all visibility + the Filters badge. */
export function isActive(value: FilterValue, d: FilterDescriptor): boolean {
  switch (d.control) {
    case 'search':
    case 'dropdown':
      return typeof value === 'string' && value.trim() !== ''
    case 'segmented':
      return typeof value === 'string' && value !== (d.options?.[0]?.value ?? '')
    case 'dateRange':
      return isRange(value) && value.preset !== 'all_time'
    case 'popover':
      return d.multi
        ? Array.isArray(value) && value.length > 0
        : typeof value === 'string' && value.trim() !== ''
  }
}

function isRange(value: FilterValue): value is DateRangeValue {
  return typeof value === 'object' && !Array.isArray(value)
}

/** Count active descriptors in `descriptors` (pass the overflow subset for the Filters badge). */
export function activeFilterCount(state: FilterState, descriptors: FilterDescriptor[]): number {
  return descriptors.filter((d) => isActive(state[d.key] ?? defaultValue(d), d)).length
}

/** Any active filter at all? (clear-all visibility) */
export function anyActive(state: FilterState, descriptors: FilterDescriptor[]): boolean {
  return descriptors.some((d) => isActive(state[d.key] ?? defaultValue(d), d))
}

/** The all-defaults state (clear-all target). */
export function clearState(descriptors: FilterDescriptor[]): FilterState {
  return Object.fromEntries(descriptors.map((d) => [d.key, defaultValue(d)]))
}

/**
 * Project the active FilterState into a complete `VisualizationFilter` (§4.12) so "Visualize the current
 * set" (§12.8) needs no translation. Only descriptors with `toVizField` are projected; ledger-only
 * filters (status / gst / reconciled) are intentionally skipped — they are not visualization dimensions.
 * `currency_mode` / `display_currency` are not record-list FilterBar controls; they default here and are
 * owned by the Viewer / Person at the consumer (Epic 9).
 */
export function serializeToVisualizationFilter(
  state: FilterState,
  descriptors: FilterDescriptor[],
): VisualizationFilter {
  const vf: VisualizationFilter = {
    time_range: { start: ALL_TIME_START, end: ALL_TIME_END, preset: 'all_time' },
    person_ids: [],
    category_ids: [],
    account_ids: [],
    tag_ids: [],
    currency_mode: 'converted',
    display_currency: 'SGD',
    transaction_type: 'all',
    is_shared_expense: null,
    comparison_mode: null,
    comparison_ids: [],
    comparison_group_by: null,
  }

  for (const d of descriptors) {
    if (!d.toVizField) continue
    const v = state[d.key]
    switch (d.toVizField) {
      case 'time_range':
        if (isRange(v) && v.preset) {
          vf.time_range = {
            start: v.start ? new Date(v.start) : ALL_TIME_START,
            end: v.end ? new Date(v.end) : ALL_TIME_END,
            preset: v.preset,
          }
        }
        break
      case 'transaction_type':
        if (typeof v === 'string' && v) vf.transaction_type = v as VisualizationFilter['transaction_type']
        break
      case 'tag_ids':
        if (Array.isArray(v)) vf.tag_ids = v
        break
      case 'category_ids':
        if (typeof v === 'string' && v) vf.category_ids = [v]
        break
      case 'account_ids':
        if (typeof v === 'string' && v) vf.account_ids = [v]
        break
      case 'person_ids':
        if (typeof v === 'string' && v) vf.person_ids = [v]
        break
    }
  }

  return vf
}
