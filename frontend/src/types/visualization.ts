// The VisualizationFilter contract — transcribed verbatim from architecture.md §4.12. Story 5.0d
// (FilterBar) is its first consumer; Epic 9's visualizationStore imports the SAME type (one app-level
// object, §6.3). Do not add or remove fields here without changing ARCH §4.12.

export type UUID = string
export type ISO4217 = string

export interface VisualizationFilter {
  time_range: {
    start: Date
    end: Date
    preset: 'month' | 'quarter' | 'year' | 'all_time' | 'custom'
  }
  person_ids: UUID[] // [] = household aggregate
  category_ids: UUID[] // [] = all; set on segment click
  account_ids: UUID[] // [] = all
  tag_ids: UUID[] // [] = no filter; OR semantics — a tx matches if it has ANY listed tag
  currency_mode: 'raw' | 'converted'
  display_currency: ISO4217 // from Person.display_currency
  transaction_type: 'all' | 'inflow' | 'outflow'
  is_shared_expense: boolean | null // null = no filter (debt drill-down sets true)
  comparison_mode: 'persons' | 'categories' | null // mutually exclusive w/ single filtering
  comparison_ids: UUID[]
  comparison_group_by: 'category' | 'tag' | 'month' | 'quarter' | 'year' | 'payment_method' | null
}
