import { useCallback, useMemo, useState } from 'react'

// Generic multi-select state for the generic entity layer (FR-E-020). This is PURE CLIENT UI STATE
// (§6.3) — selection is ephemeral, per-view, and resets on unmount/navigation by design, so it lives
// in a single useState<Set>, NOT in TanStack Query (that is for server data, §6.4 / useEntityManager)
// and NOT in entity_preferences (that is the persisted per-person favourite/sort, useEntityPreferences).
// Every mutator returns a NEW Set so React re-renders (mutating the live Set in place is identity-equal
// → no re-render: the classic bug).

export interface MultiSelect {
  selectedIds: ReadonlySet<string>
  isSelected: (id: string) => boolean
  toggle: (id: string) => void
  select: (id: string) => void
  deselect: (id: string) => void
  selectAll: (ids: string[]) => void
  clear: () => void
  selectedCount: number
  hasSelection: boolean
}

export function useMultiSelect(): MultiSelect {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const select = useCallback((id: string) => {
    setSelectedIds((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const deselect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids))
  }, [])

  const clear = useCallback(() => {
    setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()))
  }, [])

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds])

  return useMemo(
    () => ({
      selectedIds,
      isSelected,
      toggle,
      select,
      deselect,
      selectAll,
      clear,
      selectedCount: selectedIds.size,
      hasSelection: selectedIds.size > 0,
    }),
    [selectedIds, isSelected, toggle, select, deselect, selectAll, clear],
  )
}
