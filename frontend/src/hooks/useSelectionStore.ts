import { useRef, useSyncExternalStore } from 'react'

// An external (outside-React) multi-select store so a selection toggle re-renders ONLY the rows whose
// membership flipped — not the whole list. The CategoryTree is a tree of `@dnd-kit` context consumers, so
// passing a changing `selectedIds` prop re-renders the entire `DndContext` subtree on every toggle (and
// React.memo can't block context-driven re-renders). Holding selection here and subscribing per-row with
// `useSyncExternalStore` keeps the tree/DndContext from re-rendering at all on toggle (SCP item 9).
//
// This complements the generic `useMultiSelect` (ephemeral page state, §6.3): same idea, but the store
// instance is stable for the surface's lifetime and exposes a per-id subscription the rows read directly.

export interface SelectionStore {
  toggle(id: string): void
  clear(): void
  has(id: string): boolean
  /** The live selected set (stable ref between changes — safe as a `useSyncExternalStore` snapshot). */
  ids(): ReadonlySet<string>
  subscribe(listener: () => void): () => void
}

export function createSelectionStore(): SelectionStore {
  let set: ReadonlySet<string> = new Set()
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((l) => l())
  return {
    toggle(id) {
      const next = new Set(set)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      set = next
      emit()
    },
    clear() {
      if (set.size > 0) {
        set = new Set()
        emit()
      }
    },
    has: (id) => set.has(id),
    ids: () => set,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** A stable store instance for the component's lifetime. */
export function useSelectionStore(): SelectionStore {
  const ref = useRef<SelectionStore>(undefined)
  if (!ref.current) ref.current = createSelectionStore()
  return ref.current
}

/** Per-row membership — re-renders the caller ONLY when *this* id's selected state flips. */
export function useIsSelected(store: SelectionStore, id: string): boolean {
  return useSyncExternalStore(
    store.subscribe,
    () => store.has(id),
  )
}

/** The whole selected set — re-renders the caller (the bulk bar / page region) on any selection change. */
export function useSelectedIds(store: SelectionStore): ReadonlySet<string> {
  return useSyncExternalStore(store.subscribe, store.ids)
}
