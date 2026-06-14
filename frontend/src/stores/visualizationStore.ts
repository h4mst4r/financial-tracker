import { create } from 'zustand'

/** Date range preset or custom range */
export type DateRange =
  | 'last7d'
  | 'last30d'
  | 'last90d'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisYear'
  | 'custom'

/** Group-by dimension for visualizations */
export type GroupBy = 'day' | 'week' | 'month' | 'category' | 'account' | 'payee'

interface VisualizationState {
  dateRange: DateRange
  groupBy: GroupBy
  entityFilter: string | null
  currencyFilter: string | null
  setDateRange: (range: DateRange) => void
  setGroupBy: (groupBy: GroupBy) => void
  setEntityFilter: (entityId: string | null) => void
  setCurrencyFilter: (currency: string | null) => void
  reset: () => void
}

export const useVisualizationStore = create<VisualizationState>((set) => ({
  dateRange: 'last30d',
  groupBy: 'month',
  entityFilter: null,
  currencyFilter: null,

  setDateRange: (dateRange) => set({ dateRange }),
  setGroupBy: (groupBy) => set({ groupBy }),
  setEntityFilter: (entityFilter) => set({ entityFilter }),
  setCurrencyFilter: (currencyFilter) => set({ currencyFilter }),

  reset: () =>
    set({
      dateRange: 'last30d',
      groupBy: 'month',
      entityFilter: null,
      currencyFilter: null,
    }),
}))
