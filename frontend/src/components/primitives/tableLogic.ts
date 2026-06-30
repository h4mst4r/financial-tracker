// Pure decision logic for the Table<T> primitive (§8.7) — no React, no DOM, so it is unit-testable in
// isolation (Story 5.0a AC4). The Table component is a thin wrapper over these three functions.

export type SortDir = 'asc' | 'desc'
export interface SortState {
  key: string
  dir: SortDir
}

/** Header-click → next sort. Same column toggles direction; a new column starts ascending. */
export function nextSort(current: SortState | null, key: string): SortState {
  if (current && current.key === key) {
    return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
  }
  return { key, dir: 'asc' }
}

/**
 * Stable sort by the active column's `sortValue`. `sort == null` → original order (passthrough).
 * `sortValueFor` returns the comparable key for a row+column (string or number). Strings compare
 * with `localeCompare`; numbers numerically. Returns a NEW array — never mutates `rows`.
 */
export function sortRows<T>(
  rows: readonly T[],
  sort: SortState | null,
  sortValueFor: (row: T, key: string) => string | number,
): T[] {
  if (!sort) return [...rows]
  const dir = sort.dir === 'asc' ? 1 : -1
  // Decorate-sort-undecorate keeps the sort stable (Array.prototype.sort is stable in modern JS, but
  // the index tie-break makes it explicit and engine-independent).
  return rows
    .map((row, index) => ({ row, index, value: sortValueFor(row, sort.key) }))
    .sort((a, b) => {
      const cmp =
        typeof a.value === 'number' && typeof b.value === 'number'
          ? a.value - b.value
          : String(a.value).localeCompare(String(b.value))
      // Tie-break by input index (no `dir`) so ties keep input order in BOTH directions (stable).
      return cmp !== 0 ? cmp * dir : a.index - b.index
    })
    .map((d) => d.row)
}

/**
 * How an inline edit session ended → whether to commit (§12.3a / §8.7). Enter and a blur that leaves
 * the cell commit; Esc and a blur that stays inside the cell (e.g. opening a Dropdown/DatePicker popup)
 * do not. The component additionally guards against a trailing trigger after the session already
 * resolved (the 4.11 double-fire defer) — see Table.tsx.
 */
export type CommitTrigger = 'enter' | 'escape' | 'blur-out' | 'blur-within'

export function shouldCommit(trigger: CommitTrigger): boolean {
  return trigger === 'enter' || trigger === 'blur-out'
}

/**
 * Infinite-scroll (keyset paging, ARCH §4.10) fetch decision. The virtualized Table asks for the next
 * page once the last windowed row index reaches within `overscan` of the end — but only while a next
 * page exists AND no fetch is already in flight (the consumer owns the `useInfiniteQuery`; Table only
 * signals — Table.tsx boundary). Pure so the near-bottom boundary is unit-tested without a DOM.
 */
export interface NearBottomArgs {
  /** The greatest row index currently mounted by the virtualizer. */
  lastIndex: number
  /** Rows already loaded (the data source length). */
  rowCount: number
  /** The virtualizer's overscan buffer — fetch when within this many rows of the end. */
  overscan: number
  hasNextPage: boolean
  isFetchingNextPage: boolean
}

export function shouldFetchNext({
  lastIndex,
  rowCount,
  overscan,
  hasNextPage,
  isFetchingNextPage,
}: NearBottomArgs): boolean {
  if (!hasNextPage || isFetchingNextPage || rowCount === 0) return false
  return lastIndex >= rowCount - 1 - overscan
}
