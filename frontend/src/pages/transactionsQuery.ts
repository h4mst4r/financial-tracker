import type { DateRangeValue, FilterState } from '../components/primitives/filterBarLogic'
import type { SortState } from '../components/primitives/Table'
import type { Transaction, TransactionUpdate } from '../types/event'

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
  includeArchived = false,
): string {
  const p = new URLSearchParams()

  // The toolbar Archived toggle (not a FilterBar descriptor) — the backend hides archived rows by
  // default; `include_archived=true` surfaces them (so a row can be reached for ⋮ Restore).
  if (includeArchived) p.set('include_archived', 'true')

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

// ─── Inline-edit cell → PATCH mapping (Story 5.3) ───

// The editable ledger column keys → their `TransactionUpdate` field + the `Transaction` field to
// patch optimistically in the cache. Column keys mirror the ColumnDef `key`s in Transactions.tsx.
// The Base column (`amount_base`) is the FX manual override; a bare amount edit re-fills spot.
const CELL_FIELD = {
  event_date: 'event_date',
  name: 'name',
  payee: 'payee_person_id',
  category: 'category_id',
  currency: 'currency',
  amount: 'amount',
  amount_base: 'amount_base',
} as const

export type CellField = keyof typeof CELL_FIELD

export function isCellField(key: string): key is CellField {
  return key in CELL_FIELD
}

/** The single-field PATCH body for an inline cell commit (Story 5.3, AC1). */
export function cellCommitPayload(key: CellField, value: string): TransactionUpdate {
  return { [CELL_FIELD[key]]: value } as TransactionUpdate
}

/** Apply an inline commit to a cached row (optimistic) — sets the mapped `Transaction` field. */
export function applyCellEdit(row: Transaction, key: CellField, value: string): Transaction {
  return { ...row, [CELL_FIELD[key]]: value } as Transaction
}

/** Per-row mutation permission (AC3, ARCH §1795-1800): a Member acts only on rows they created;
 *  Admin/Owner on any. Pure so both the inline-edit gate and the ⋮ menu share one rule. */
export function canMutateRow(
  person: { role: string; personId: string } | null | undefined,
  row: { created_by: string },
): boolean {
  return !!person && (person.role !== 'member' || row.created_by === person.personId)
}
