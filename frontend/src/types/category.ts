import type { BaseEntity } from './entity'

// Category — the 2-level tree entity (ARCH §3.7, Story 3.1). Snake_case wire keys (generic-entity
// surface; the household/profile camelCase is the §2.14.C exception). `depth` is 0 (top-level) or 1
// (subcategory); `parent_id` is null for top-level. `vivid` is the per-instance full-saturation
// fill opt-in (FR-SYS-016).
export interface Category extends BaseEntity {
  name: string
  color: string
  icon: string | null
  category_type: 'income' | 'expense' | 'both'
  parent_id: string | null
  depth: number
  vivid: boolean
  // Story 3.2: computed server-side from the dependency scan — drives the ⋮ Delete-disabled-with-
  // reason (UX §8.1). `can_delete=false` ⇒ `delete_blocked_reason` is the human reason.
  can_delete: boolean
  delete_blocked_reason: string | null
}

export type CategoryType = Category['category_type']

// Type → semantic colour. Income = inflow green (`success`), Expense = outflow red (`error`) —
// matching the app-wide inflow/outflow semantics (UX §0.1); Both = neutral blue (`info`). All three
// are semantic tokens, so they remap per theme. `badge` is the Badge variant, `text` the text-colour
// utility (used for the modal Type dropdown labels). Shared by CategoryTree + the Categories page.
export const CATEGORY_TYPE_META: Record<
  CategoryType,
  { label: string; badge: 'success' | 'error' | 'info'; text: string }
> = {
  income: { label: 'Income', badge: 'success', text: 'text-success' },
  expense: { label: 'Expense', badge: 'error', text: 'text-error' },
  both: { label: 'Both', badge: 'info', text: 'text-info' },
}
