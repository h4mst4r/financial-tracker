import { describe, it, expect } from 'vitest'
import { buildEventQuery } from '../src/pages/transactionsQuery'
import type { FilterState } from '../src/components/primitives'

// The pure ledger FilterState + SortState + cursor → GET /api/events query mapping (Story 5.2).
function parse(qs: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(qs))
}

describe('buildEventQuery — FilterState → API params', () => {
  it('an empty state produces no params', () => {
    expect(buildEventQuery({}, null, null)).toBe('')
  })

  it('maps each descriptor to its server param', () => {
    const state: FilterState = {
      search: 'lunch',
      category: 'cat-1',
      account: 'acc-1',
      person: 'p-1',
      status: 'completed',
    }
    const p = parse(buildEventQuery(state, null, null))
    expect(p.search).toBe('lunch')
    expect(p.category_id).toBe('cat-1')
    expect(p.account_id).toBe('acc-1')
    expect(p.person_id).toBe('p-1')
    expect(p.status).toBe('completed')
  })

  it("omits type when 'all' (first segment = no filter) and sends it otherwise", () => {
    expect(parse(buildEventQuery({ type: 'all' }, null, null)).type).toBeUndefined()
    expect(parse(buildEventQuery({ type: 'outflow' }, null, null)).type).toBe('outflow')
  })

  it('projects a dateRange preset into date_start/date_end but skips all_time', () => {
    const withRange = parse(
      buildEventQuery({ dateRange: { preset: 'custom', start: '2026-06-01', end: '2026-06-30' } }, null, null),
    )
    expect(withRange.date_start).toBe('2026-06-01')
    expect(withRange.date_end).toBe('2026-06-30')
    const allTime = parse(buildEventQuery({ dateRange: { preset: 'all_time' } }, null, null))
    expect(allTime.date_start).toBeUndefined()
    expect(allTime.date_end).toBeUndefined()
  })

  it('maps the tri-state gst/reconciled dropdowns to boolean params', () => {
    expect(parse(buildEventQuery({ gst: 'claimable' }, null, null)).gst).toBe('true')
    expect(parse(buildEventQuery({ gst: 'not' }, null, null)).gst).toBe('false')
    expect(parse(buildEventQuery({ gst: '' }, null, null)).gst).toBeUndefined()
    expect(parse(buildEventQuery({ reconciled: 'yes' }, null, null)).reconciled).toBe('true')
    expect(parse(buildEventQuery({ reconciled: 'no' }, null, null)).reconciled).toBe('false')
  })

  it('serialises sort and cursor', () => {
    const p = parse(buildEventQuery({}, { key: 'amount', dir: 'desc' }, 'CUR123'))
    expect(p.sort).toBe('amount:desc')
    expect(p.cursor).toBe('CUR123')
  })

  it('sets include_archived only when the Archived toggle is on', () => {
    expect(parse(buildEventQuery({}, null, null)).include_archived).toBeUndefined()
    expect(parse(buildEventQuery({}, null, null, false)).include_archived).toBeUndefined()
    expect(parse(buildEventQuery({}, null, null, true)).include_archived).toBe('true')
  })
})
