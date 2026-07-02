import { useState, useRef, useEffect, useLayoutEffect, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { CONTROL_ICON } from '../../config/iconRegistry'
import { Icon } from './Icon'
import { Skeleton } from './Skeleton'
import { Spinner } from './Spinner'
import {
  nextSort,
  sortRows,
  shouldCommit,
  shouldFetchNext,
  type SortState,
  type CommitTrigger,
} from './tableLogic'

// Table<T> — the ONE tabular primitive (UX §8.7, bible #table). This story (5.0a) ships the
// record-ledger profile only: the fixed-width column grid, sortable headers (internal default OR
// controlled), density, optional responsive collapse-to-cards, loading Skeleton, pinned-row slots, and
// the §12.3a inline cell-edit mechanism lifted from the 4.11 SnapshotLedger pilot. The shell owns the
// row-grid and NOTHING else — data/selection come from useEntityManager/useMultiSelect, filters from
// FilterBar, rich edit from EntityModal (the boundary that stops Table re-absorbing every surface).
// Aggregation profile = Story 9.2b (the table chart-type render); config profile + bespoke-surface
// retrofit = Story 5.12.
//
// Scale (5f-8): a `virtualized` flag windows the DOM via @tanstack/react-virtual (only the visible rows
// + a buffer mount → bounded DOM, not proportional to data) and an `infinite` data source pairs it with
// server keyset paging (§"Data — Table" line 481, ARCH §4.10). The query stays in the CONSUMER — Table
// only detects "near the bottom" and calls the consumer-supplied fetchNextPage. Never a numbered pager.

export type { SortState, SortDir } from './tableLogic'

/** What an `editControl` receives to drive an inline cell edit. */
export interface CellEditContext<T> {
  row: T
  /** The working draft string (Table owns it). */
  value: string
  setValue: (value: string) => void
  /** Commit `value` (or an explicit override, e.g. a DatePicker's selected ISO) → onCellCommit. */
  commit: (override?: string) => void
  /** Abandon the edit, restore the prior value, no request. */
  cancel: () => void
}

/** The reuse unit (§8.7): surfaces share column descriptors, not "the table". */
export interface ColumnDef<T> {
  key: string
  header: ReactNode
  align?: 'left' | 'right' | 'center'
  /** Fixed grid track width (a CSS length, e.g. '8rem') so columns line up across rows (§12.1). */
  width?: string
  sortable?: boolean
  /** Comparable key for internal sort (required when `sortable` and Table sorts internally). */
  sortValue?: (row: T) => string | number
  render: (row: T) => ReactNode
  editable?: boolean
  /** The control swapped in on double-click; omit for non-editable columns. */
  editControl?: (ctx: CellEditContext<T>) => ReactNode
  /** Seed value when entering edit mode (defaults to ''). */
  editInitial?: (row: T) => string
  /** Hide this column below the named breakpoint (§12.6 tablet "fewer columns" fold — the info must
   *  survive elsewhere, e.g. in a sibling column's sub-line). Omit to always show. */
  hideBelow?: 'md' | 'lg'
}

/** Server keyset-paged data source (ARCH §4.10). The consumer owns the `useInfiniteQuery` and passes
 *  this seam; Table never fetches — it only signals near-bottom + renders the loading sentinel. */
export interface InfiniteSource {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => void
}

export interface TableProps<T> {
  columns: ColumnDef<T>[]
  rows: T[]
  rowKey: (row: T) => string
  loading?: boolean
  /** Enables the double-click inline edit mechanism (§12.3a). */
  inlineEdit?: boolean
  /** Per-row edit permission (Member own-rows only, etc.). Default: all editable. */
  canEditRow?: (row: T) => boolean
  /** Caller persists the single-field change (optimistic + rollback + toast live HERE, not in Table). */
  onCellCommit?: (row: T, key: string, value: string) => void
  /** Controlled sort: pass BOTH for server-side sort; omit for internal client sort. */
  sort?: SortState | null
  onSortChange?: (sort: SortState) => void
  /** Pinned rows inside the scroll frame — pass `<tr>` matching the columns (quick-add / totals). */
  pinnedTop?: ReactNode
  pinnedBottom?: ReactNode
  /** Per-row card for the < md collapse (§12.6); omit to keep the table at all sizes. */
  renderCard?: (row: T) => ReactNode
  /** Shown when there are no rows and not loading. */
  emptyContent?: ReactNode
  /** Window the DOM (§"Data — Table" line 481) — declare for any list expected to exceed a few hundred
   *  rows. Only the visible rows + a buffer mount. Unset = the current full render (zero change). */
  virtualized?: boolean
  /** Server keyset paging (ARCH §4.10) — implies `virtualized`. Table calls `fetchNextPage` near the
   *  bottom and shows a loading sentinel; never a numbered pager. `undefined` = a plain in-memory list.
   *  Sort/filter MUST be server-side: under `infinite` Table does NOT client-sort (internal `sortRows`
   *  would re-order only the loaded pages — wrong for keyset), so a sortable column must be controlled. */
  infinite?: InfiniteSource
  className?: string
}

const alignClass: Record<NonNullable<ColumnDef<unknown>['align']>, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
}

// §12.6 responsive column fold — hide a column below the breakpoint. The <col> needs `table-column`
// (its natural display) and the cells `table-cell` so the width track collapses with the content (no
// blank gap under `table-layout: fixed`); both are the same breakpoint, applied in lockstep.
const HIDE_COL: Record<NonNullable<ColumnDef<unknown>['hideBelow']>, string> = {
  md: 'hidden md:table-column',
  lg: 'hidden lg:table-column',
}
const HIDE_CELL: Record<NonNullable<ColumnDef<unknown>['hideBelow']>, string> = {
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
}

// react-virtual buffer: rows within this many of the viewport stay mounted (so a small scroll keeps an
// active inline editor alive) and it doubles as the infinite-mode near-bottom trigger distance.
const VIRTUAL_OVERSCAN = 8
// Mirrors --ledger-row-height (comfortable) — used only when getComputedStyle can't resolve the token
// (jsdom has no stylesheet). In a real browser the token value wins (read in useLayoutEffect below).
const FALLBACK_ROW_HEIGHT_PX = 37

export function Table<T>({
  columns,
  rows,
  rowKey,
  loading,
  inlineEdit,
  canEditRow,
  onCellCommit,
  sort,
  onSortChange,
  pinnedTop,
  pinnedBottom,
  renderCard,
  emptyContent,
  virtualized,
  infinite,
  className = '',
}: TableProps<T>) {
  // Sort is "controlled" iff the caller wired both pieces; otherwise Table holds its own (§8.7).
  const controlled = sort !== undefined && onSortChange !== undefined
  const [internalSort, setInternalSort] = useState<SortState | null>(null)
  const activeSort = controlled ? (sort ?? null) : internalSort

  const sortValueFor = (row: T, key: string): string | number => {
    const col = columns.find((c) => c.key === key)
    return col?.sortValue ? col.sortValue(row) : ''
  }
  // Internal client sort applies only to a fully in-memory dataset. Under `infinite` the rows arrive
  // server-ordered in pages, so re-sorting here would re-order ONLY the loaded pages (wrong for keyset) —
  // skip it (sort must be controlled/server-side; see the `infinite` prop doc).
  const displayRows =
    controlled || infinite !== undefined ? rows : sortRows(rows, internalSort, sortValueFor)

  const onHeaderClick = (col: ColumnDef<T>) => {
    if (!col.sortable) return
    const next = nextSort(activeSort, col.key)
    if (controlled) onSortChange!(next)
    else setInternalSort(next)
  }

  // Inline-edit session state. `draft` is the working value; `resolved` guards the 4.11 double-fire
  // (Enter commits then unmount fires a trailing blur → ignored).
  const [editing, setEditing] = useState<{ rowId: string; colKey: string } | null>(null)
  const [draft, setDraft] = useState('')
  const resolved = useRef(false)

  const isEditing = (id: string, colKey: string) =>
    editing?.rowId === id && editing.colKey === colKey

  const startEdit = (row: T, col: ColumnDef<T>) => {
    if (!inlineEdit || !col.editable || !col.editControl) return
    if (canEditRow && !canEditRow(row)) return
    resolved.current = false
    setDraft(col.editInitial ? col.editInitial(row) : '')
    setEditing({ rowId: rowKey(row), colKey: col.key })
  }

  const cancel = () => {
    if (resolved.current) return
    resolved.current = true
    setEditing(null)
  }

  const commit = (row: T, col: ColumnDef<T>, override?: string) => {
    if (resolved.current) return
    resolved.current = true
    onCellCommit?.(row, col.key, override ?? draft)
    setEditing(null)
  }

  const onCellTrigger = (row: T, col: ColumnDef<T>, trigger: CommitTrigger) => {
    // blur-within (focus moved to a popup the editor opened INSIDE the cell, e.g. a DatePicker/Dropdown)
    // must be a true no-op — neither commit nor tear the editor down — or the picker closes the instant
    // it opens (§12.3a). Only Esc cancels; Enter / blur-out commit.
    if (trigger === 'blur-within') return
    if (shouldCommit(trigger)) commit(row, col)
    else cancel()
  }

  const colCount = columns.length

  // ── Virtualization (5f-8) — `infinite` implies `virtualized`. ──
  const isVirtual = virtualized || infinite !== undefined
  const scrollRef = useRef<HTMLDivElement>(null)
  const rowHeightRef = useRef(FALLBACK_ROW_HEIGHT_PX)
  useLayoutEffect(() => {
    if (!isVirtual) return
    // The token resolves to a length ("37px") so parseFloat gets a usable estimate; jsdom returns "" →
    // the fallback holds. Rows are fixed height, so the estimate is exact (no measureElement needed).
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--ledger-row-height')
    const px = parseFloat(raw)
    if (!Number.isNaN(px)) rowHeightRef.current = px
  }, [isVirtual])

  const virtualizer = useVirtualizer({
    count: isVirtual ? displayRows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeightRef.current,
    overscan: VIRTUAL_OVERSCAN,
  })
  const virtualItems = isVirtual ? virtualizer.getVirtualItems() : []
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0
  const paddingBottom =
    virtualItems.length > 0
      ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0
  const lastVirtualIndex =
    virtualItems.length > 0 ? virtualItems[virtualItems.length - 1].index : -1

  // Infinite mode: fire fetchNextPage once per page boundary (the row-count guard stops a repeat-fire
  // before isFetchingNextPage flips; shouldFetchNext stops it once there's no next page or one is
  // in flight). The consumer owns the query — Table only signals (boundary above).
  const fetchedAtCount = useRef(-1)
  useEffect(() => {
    if (!infinite || lastVirtualIndex < 0) return
    const ready = shouldFetchNext({
      lastIndex: lastVirtualIndex,
      rowCount: displayRows.length,
      overscan: VIRTUAL_OVERSCAN,
      hasNextPage: infinite.hasNextPage,
      isFetchingNextPage: infinite.isFetchingNextPage,
    })
    if (ready && fetchedAtCount.current !== displayRows.length) {
      fetchedAtCount.current = displayRows.length
      infinite.fetchNextPage()
    }
  }, [infinite, lastVirtualIndex, displayRows.length])

  const renderRow = (row: T): ReactNode => {
    const id = rowKey(row)
    return (
      <tr key={id} className="hover:bg-surface-hover">
        {columns.map((col) => {
          const align = col.align ?? 'left'
          const editingThis = isEditing(id, col.key)
          const canEdit =
            inlineEdit && col.editable && col.editControl && (!canEditRow || canEditRow(row))
          return (
            <td
              key={col.key}
              className={`border-b border-border px-sm py-control align-middle ${alignClass[align]} ${col.hideBelow ? HIDE_CELL[col.hideBelow] : ''}`}
            >
              {editingThis && col.editControl ? (
                // Enter/Esc bubble here; blur-out (focus left the whole cell) commits, blur
                // INTO a popup opened by the editor (Dropdown/DatePicker) does not (§12.3a).
                <span
                  // Presentational wrapper that delegates Enter/Esc bubbling from the inner
                  // edit control to the cell commit/cancel (the control is the real widget).
                  role="presentation"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onCellTrigger(row, col, 'enter')
                    if (e.key === 'Escape') onCellTrigger(row, col, 'escape')
                  }}
                  onBlur={(e) =>
                    onCellTrigger(
                      row,
                      col,
                      e.currentTarget.contains(e.relatedTarget as Node | null)
                        ? 'blur-within'
                        : 'blur-out',
                    )
                  }
                >
                  {col.editControl({
                    row,
                    value: draft,
                    setValue: setDraft,
                    commit: (override) => commit(row, col, override),
                    cancel,
                  })}
                </span>
              ) : canEdit ? (
                <button
                  type="button"
                  // Respect the column's alignment — a right-aligned money cell stays right (§12.1).
                  className={`w-full truncate ${alignClass[align]}`}
                  onDoubleClick={() => startEdit(row, col)}
                  aria-label={`Edit ${typeof col.header === 'string' ? col.header : col.key}`}
                >
                  {col.render(row)}
                </button>
              ) : (
                col.render(row)
              )}
            </td>
          )
        })}
      </tr>
    )
  }

  return (
    <div className={`overflow-hidden rounded-md border border-border ${className}`}>
      {/* Mobile collapse-to-cards (§12.6): a tap never double-clicks, so inline edit is desktop/tablet
          only for free — no matchMedia. Omit renderCard to keep the table at all widths. The card list
          is NOT virtualized (5f-8 AC#3 — the windowing requirement is the table-grid path). */}
      {renderCard && (
        <div className="md:hidden">
          {loading ? (
            <Skeleton className="m-sm">
              <Skeleton variant="rect" className="h-10" />
            </Skeleton>
          ) : displayRows.length === 0 ? (
            <div className="px-sm py-md text-sm text-text-default">{emptyContent}</div>
          ) : (
            displayRows.map((row) => <div key={rowKey(row)}>{renderCard(row)}</div>)
          )}
        </div>
      )}

      <div ref={scrollRef} className={`max-h-ledger overflow-y-auto ${renderCard ? 'hidden md:block' : ''}`}>
        <table className="w-full border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
          {columns.some((c) => c.width) && (
            <colgroup>
              {columns.map((c) => (
                <col
                  key={c.key}
                  className={c.hideBelow ? HIDE_COL[c.hideBelow] : undefined}
                  style={c.width ? { width: c.width } : undefined}
                />
              ))}
            </colgroup>
          )}
          <thead>
            <tr>
              {columns.map((col) => {
                const align = col.align ?? 'left'
                const isActive = activeSort?.key === col.key
                return (
                  <th
                    key={col.key}
                    // Bible .ledger th — sentence case (NOT uppercase), 11px/500/text-muted, 8px block padding.
                    className={`whitespace-nowrap border-b border-border px-sm py-xs text-2xs font-medium text-text-muted ${alignClass[align]} ${col.hideBelow ? HIDE_CELL[col.hideBelow] : ''}`}
                    aria-sort={
                      col.sortable
                        ? isActive
                          ? activeSort!.dir === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                        : undefined
                    }
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        className={`inline-flex items-center gap-2xs ${align === 'right' ? 'ml-auto' : ''} hover:text-text-default focus:outline-none focus-visible:ring-2 focus-visible:ring-glow-primary rounded`}
                        onClick={() => onHeaderClick(col)}
                        aria-label={`Sort by ${typeof col.header === 'string' ? col.header : col.key}`}
                      >
                        {col.header}
                        {isActive && (
                          <Icon icon={activeSort!.dir === 'asc' ? CONTROL_ICON.chevronUp : CONTROL_ICON.chevronDown} size={12} />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {pinnedTop}
            {loading ? (
              <tr>
                <td colSpan={colCount} className="p-sm">
                  <Skeleton>
                    <Skeleton variant="rect" className="h-10" />
                  </Skeleton>
                </td>
              </tr>
            ) : displayRows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-sm py-md text-sm text-text-default">
                  {emptyContent}
                </td>
              </tr>
            ) : isVirtual ? (
              // Windowed: leading/trailing spacer rows hold the off-screen height so the scrollbar +
              // colgroup grid stay correct while only the in-window <tr>s mount (the react-virtual
              // <table> recipe that preserves tableLayout:fixed — see Dev Notes).
              <>
                {paddingTop > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={colCount} style={{ height: paddingTop }} />
                  </tr>
                )}
                {virtualItems.map((vi) => renderRow(displayRows[vi.index]))}
                {paddingBottom > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={colCount} style={{ height: paddingBottom }} />
                  </tr>
                )}
                {infinite?.isFetchingNextPage && (
                  <tr data-testid="infinite-sentinel">
                    <td colSpan={colCount} className="px-sm py-control text-center text-text-muted">
                      <span className="inline-flex items-center gap-xs">
                        <Spinner size={16} />
                        Loading more…
                      </span>
                    </td>
                  </tr>
                )}
              </>
            ) : (
              displayRows.map(renderRow)
            )}
            {pinnedBottom}
          </tbody>
        </table>
      </div>
    </div>
  )
}
