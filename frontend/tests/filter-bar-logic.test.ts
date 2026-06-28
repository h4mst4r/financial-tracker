import { describe, it, expect } from 'vitest'
import {
  defaultValue,
  isActive,
  activeFilterCount,
  anyActive,
  clearState,
  serializeToVisualizationFilter,
  type FilterDescriptor,
  type FilterState,
} from '../src/components/primitives/filterBarLogic'

const descriptors: FilterDescriptor[] = [
  { key: 'search', label: 'Search', control: 'search', primary: true },
  { key: 'dateRange', label: 'Date', control: 'dateRange', primary: true, toVizField: 'time_range' },
  {
    key: 'category',
    label: 'Category',
    control: 'dropdown',
    primary: true,
    toVizField: 'category_ids',
    options: [
      { value: 'groceries', label: 'Groceries' },
      { value: 'dining', label: 'Dining' },
    ],
  },
  {
    key: 'type',
    label: 'Type',
    control: 'segmented',
    primary: true,
    toVizField: 'transaction_type',
    options: [
      { value: 'all', label: 'All' },
      { value: 'inflow', label: 'Inflow' },
      { value: 'outflow', label: 'Outflow' },
    ],
  },
  { key: 'account', label: 'Account', control: 'dropdown', toVizField: 'account_ids', options: [{ value: 'dbs', label: 'DBS' }] },
  // Ledger-only filter (no toVizField) — carried in state, excluded from the viz projection.
  { key: 'status', label: 'Status', control: 'dropdown', options: [{ value: 'paid', label: 'Paid' }] },
  { key: 'tags', label: 'Tags', control: 'popover', multi: true, toVizField: 'tag_ids', options: [{ value: 'vacation', label: 'Vacation' }] },
]
const byKey = (key: string) => descriptors.find((d) => d.key === key)!

describe('defaultValue', () => {
  it('returns the no-filter value per control', () => {
    expect(defaultValue(byKey('search'))).toBe('')
    expect(defaultValue(byKey('category'))).toBe('')
    expect(defaultValue(byKey('type'))).toBe('all') // first segment is the default
    expect(defaultValue(byKey('dateRange'))).toEqual({ preset: 'all_time' })
    expect(defaultValue(byKey('tags'))).toEqual([])
  })
})

describe('isActive', () => {
  it('search/dropdown active only when non-empty', () => {
    expect(isActive('', byKey('search'))).toBe(false)
    expect(isActive('  ', byKey('search'))).toBe(false)
    expect(isActive('coffee', byKey('search'))).toBe(true)
    expect(isActive('', byKey('category'))).toBe(false)
    expect(isActive('dining', byKey('category'))).toBe(true)
  })
  it('segmented active only when not the first (default) segment', () => {
    expect(isActive('all', byKey('type'))).toBe(false)
    expect(isActive('inflow', byKey('type'))).toBe(true)
  })
  it('dateRange active only when the preset is not all_time', () => {
    expect(isActive({ preset: 'all_time' }, byKey('dateRange'))).toBe(false)
    expect(isActive({ preset: 'month', start: '2026-06-01', end: '2026-06-30' }, byKey('dateRange'))).toBe(true)
  })
  it('multi popover active only when at least one value is selected', () => {
    expect(isActive([], byKey('tags'))).toBe(false)
    expect(isActive(['vacation'], byKey('tags'))).toBe(true)
  })
})

describe('activeFilterCount + anyActive', () => {
  it('counts active descriptors in the given subset', () => {
    const state: FilterState = { account: 'dbs', status: 'paid', tags: [] }
    expect(activeFilterCount(state, [byKey('account'), byKey('status'), byKey('tags')])).toBe(2)
  })
  it('anyActive is false for an all-default state, true once anything is set', () => {
    expect(anyActive(clearState(descriptors), descriptors)).toBe(false)
    expect(anyActive({ ...clearState(descriptors), search: 'x' }, descriptors)).toBe(true)
  })
})

describe('clearState', () => {
  it('returns the all-defaults state', () => {
    expect(clearState(descriptors)).toEqual({
      search: '',
      dateRange: { preset: 'all_time' },
      category: '',
      type: 'all',
      account: '',
      status: '',
      tags: [],
    })
  })
})

describe('serializeToVisualizationFilter', () => {
  it('maps viz-relevant keys to the right VisualizationFilter fields', () => {
    const state: FilterState = {
      search: 'ignored', // free-text is not a viz dimension
      category: 'dining',
      account: 'dbs',
      type: 'outflow',
      tags: ['vacation'],
      dateRange: { preset: 'month', start: '2026-06-01', end: '2026-06-30' },
    }
    const vf = serializeToVisualizationFilter(state, descriptors)
    expect(vf.category_ids).toEqual(['dining'])
    expect(vf.account_ids).toEqual(['dbs'])
    expect(vf.transaction_type).toBe('outflow')
    expect(vf.tag_ids).toEqual(['vacation'])
    expect(vf.time_range.preset).toBe('month')
    expect(vf.time_range.start).toEqual(new Date('2026-06-01'))
    expect(vf.time_range.end).toEqual(new Date('2026-06-30'))
  })

  it('excludes ledger-only filters (status) from the projection', () => {
    const vf = serializeToVisualizationFilter({ status: 'paid' }, descriptors)
    // status has no VisualizationFilter field — the produced object carries no trace of it.
    expect(Object.values(vf)).not.toContain('paid')
    expect(vf).not.toHaveProperty('status')
  })

  it('produces the documented sentinels for an empty state', () => {
    const vf = serializeToVisualizationFilter(clearState(descriptors), descriptors)
    expect(vf.category_ids).toEqual([])
    expect(vf.account_ids).toEqual([])
    expect(vf.tag_ids).toEqual([])
    expect(vf.transaction_type).toBe('all')
    expect(vf.time_range.preset).toBe('all_time')
    expect(vf.currency_mode).toBe('converted')
    expect(vf.is_shared_expense).toBeNull()
  })
})
