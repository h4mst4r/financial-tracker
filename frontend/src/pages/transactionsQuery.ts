import type { DateRangeValue, FilterState } from '../components/primitives/filterBarLogic'
import type { SortState } from '../components/primitives/Table'

// Pure FilterState + SortState + cursor → the `GET /api/events` query string (ARCH §4.10). Kept
// pure (no React/DOM) so the ledger↔API param mapping is unit-tested in isolation (Story 5.2 Task 11).
// The record-list FilterBar descriptor keys (search/dateRange/category/type/account/person/status/
// gst/reconciled) map to the endpoint's server-side filter params; `type:'all'` (or empty) omits the
// param (no filter), matching the FilterBar's "first segment = default" rule.

function isRange(v: unknown): v is DateRangeValue {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function buildEventQuery(
  state: FilterState,
  sort: SortState | null,
  cursor: string | null,
): string {
  const p = new URLSearchParams()

  const search = state.search
  if (typeof search === 'string' && search.trim()) p.set('search', search.trim())

  const range = state.dateRange
  if (isRange(range) && range.preset !== 'all_time') {
    if (range.start) p.set('date_start', range.start)
    if (range.end) p.set('date_end', range.end)
  }

  const category = state.category
  if (typeof category === 'string' && category) p.set('category_id', category)

  const type = state.type
  if (typeof type === 'string' && type && type !== 'all') p.set('type', type)

  const account = state.account
  if (typeof account === 'string' && account) p.set('account_id', account)

  const person = state.person
  if (typeof person === 'string' && person) p.set('person_id', person)

  const status = state.status
  if (typeof status === 'string' && status) p.set('status', status)

  // gst / reconciled are tri-state dropdowns whose values map to a boolean query param.
  if (state.gst === 'claimable') p.set('gst', 'true')
  else if (state.gst === 'not') p.set('gst', 'false')

  if (state.reconciled === 'yes') p.set('reconciled', 'true')
  else if (state.reconciled === 'no') p.set('reconciled', 'false')

  if (sort) p.set('sort', `${sort.key}:${sort.dir}`)
  if (cursor) p.set('cursor', cursor)

  return p.toString()
}
