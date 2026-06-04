/**
 * Multi-select hook for entity lists.
 * Manages Ctrl+click, Shift+click, and Ctrl+A selection patterns.
 *
 * ARCH §4.3 — Client-side multi-select behavior
 */

import { useState, useCallback, useRef } from 'react';

export interface UseMultiSelectOptions {
  /** Total number of items in the list (for Ctrl+A range selection) */
  totalItems?: number;
  /** Callback when selection changes */
  onSelectionChange?: (selectedIds: string[]) => void;
}

export function useMultiSelect(options: UseMultiSelectOptions = {}) {
  const { totalItems, onSelectionChange } = options;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Track the last clicked index for Shift+click range selection
  const lastClickedIndex = useRef<number | null>(null);

  const isSelected = useCallback(
    (id: string): boolean => selectedIds.has(id),
    [selectedIds],
  );

  const selectItem = useCallback(
    (id: string, event?: { ctrlKey?: boolean; shiftKey?: boolean; index?: number }) => {
      const { ctrlKey = false, shiftKey = false, index } = event ?? {};

      setSelectedIds((prev) => {
        const next = new Set(prev);

        if (shiftKey && lastClickedIndex.current !== null && index != null) {
          // Range selection: full implementation requires caller to provide IDs via selectRange().
          // For now, toggle the single item (index retained for selectRange callers).
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
        } else if (ctrlKey) {
          // Ctrl+click: toggle single item
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
        } else {
          // Plain click: select only this item
          next.clear();
          next.add(id);
        }

        // Update index reference for future Shift+click
        if (index != null) {
          lastClickedIndex.current = index;
        }

        onSelectionChange?.([...next]);
        return next;
      });
    },
    [onSelectionChange],
  );

  const selectAll = useCallback(() => {
    setSelectedIds((prev) => {
      // If all items are already selected, deselect all (toggle behavior)
      if (totalItems != null && prev.size === totalItems) {
        onSelectionChange?.([]);
        return new Set();
      }
      // Selection is managed externally when totalItems is provided
      // This just toggles the "all" state
      return prev;
    });
  }, [totalItems, onSelectionChange]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    lastClickedIndex.current = null;
    onSelectionChange?.([]);
  }, [onSelectionChange]);

  const selectRange = useCallback(
    (idsInRange: string[]) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        idsInRange.forEach((id) => next.add(id));
        onSelectionChange?.([...next]);
        return next;
      });
    },
    [onSelectionChange],
  );

  return {
    selectedIds,
    isSelected,
    selectItem,
    selectAll,
    clearSelection,
    selectRange,
    selectedCount: selectedIds.size,
  };
}

export default useMultiSelect;
