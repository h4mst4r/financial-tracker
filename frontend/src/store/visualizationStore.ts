/**
 * Global visualization filter store.
 * Single source of truth for all chart filters across the app.
 * Implements drill-down / drill-up navigation per EDP §13.5.
 *
 * ARCH §3.2 — Zustand visualization store
 * Authority: entity-design-philosophy.md §13.5
 */

import { create } from 'zustand';
import type { VisualizationFilter } from '../types/visualization';
import { defaultVisualizationFilter } from '../types/visualization';

// --- Filter History Entry ---

interface FilterHistoryEntry {
  filter: VisualizationFilter;
  label: string; // Human-readable label for breadcrumbs
}

// --- Store State ---

interface VisualizationStoreState {
  /** Current active filter */
  filter: VisualizationFilter;

  /** History stack for drill-up / back navigation (max 20 entries) */
  filterHistory: FilterHistoryEntry[];

  /** Current module name (for navigation context) */
  currentModule: string | null;

  // --- Actions ---

  /** Merge a partial filter into the current state */
  setFilter: (partial: Partial<VisualizationFilter>) => void;

  /** Push current state to history and apply new filter (for drill-down) */
  drillDown: (entityType: string, entityId: string, label: string) => void;

  /** Pop from history and restore previous filter (for drill-up) */
  drillUp: () => void;

  /** Reset to default filter (current month, household aggregate) */
  resetFilter: () => void;

  /** Apply filter patch and record navigation for back-button support */
  navigateTo: (module: string, filterPatch: Partial<VisualizationFilter>) => void;

  /** Set the display currency (called when auth state changes) */
  setDisplayCurrency: (currency: string) => void;
}

const MAX_HISTORY = 20;

export const useVisualizationStore = create<VisualizationStoreState>((set, get) => ({
  filter: defaultVisualizationFilter(),
  filterHistory: [],
  currentModule: null,

  setFilter: (partial) => {
    set((state) => ({
      filter: { ...state.filter, ...partial },
    }));
  },

  drillDown: (entityType, entityId, label) => {
    const { filter } = get();

    // Push current state to history
    set((state) => {
      const newHistory = [
        ...state.filterHistory.slice(-MAX_HISTORY + 1), // Keep within limit
        { filter: state.filter, label },
      ];

      // Apply entity-specific filter based on type
      let updatedFilter = { ...state.filter };
      if (entityType === 'category') {
        updatedFilter = { ...updatedFilter, category_ids: [entityId] };
      } else if (entityType === 'person') {
        updatedFilter = { ...updatedFilter, person_ids: [entityId] };
      } else if (entityType === 'account') {
        updatedFilter = { ...updatedFilter, account_ids: [entityId] };
      }

      return {
        filter: updatedFilter,
        filterHistory: newHistory,
      };
    });
  },

  drillUp: () => {
    set((state) => {
      if (state.filterHistory.length === 0) return state;

      const history = [...state.filterHistory];
      const previous = history.pop()!;
      return {
        filter: previous.filter,
        filterHistory: history,
      };
    });
  },

  resetFilter: () => {
    const displayCurrency = get().filter.display_currency;
    set({
      filter: defaultVisualizationFilter(displayCurrency),
      filterHistory: [],
    });
  },

  navigateTo: (module, filterPatch) => {
    // Push current state to history before navigation
    set((state) => {
      const newHistory = [
        ...state.filterHistory.slice(-MAX_HISTORY + 1),
        { filter: state.filter, label: module },
      ];

      return {
        filter: { ...state.filter, ...filterPatch },
        filterHistory: newHistory,
        currentModule: module,
      };
    });
  },

  setDisplayCurrency: (currency) => {
    set((state) => ({
      filter: { ...state.filter, display_currency: currency },
    }));
  },
}));

// --- Hook for convenient access ---

/**
 * Hook that provides the current visualization filter and common actions.
 * Wraps useVisualizationStore with a cleaner API for component consumption.
 */
export function useVisualizationFilter() {
  const filter = useVisualizationStore((state) => state.filter);
  const setFilter = useVisualizationStore((state) => state.setFilter);
  const drillDown = useVisualizationStore((state) => state.drillDown);
  const drillUp = useVisualizationStore((state) => state.drillUp);
  const resetFilter = useVisualizationStore((state) => state.resetFilter);
  const navigateTo = useVisualizationStore((state) => state.navigateTo);

  return {
    filter,
    setFilter,
    drillDown,
    drillUp,
    resetFilter,
    navigateTo,
  };
}
