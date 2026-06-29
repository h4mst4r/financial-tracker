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

// Type → label + text-colour utility (used for the modal Type dropdown labels). Income = inflow green,
// Expense = outflow red, Both = neutral blue — the app-wide inflow/outflow semantics (UX §0.1). All are
// semantic text tokens, so they remap per theme. Shared by CategoryTree + the Categories page. The Badge
// VARIANT for the type is a SEMANTIC badge and resolves through the §4 registry's `categoryType` domain
// (`config/statusRegistry.ts`) — `badgeVariantForStatus('categoryType', type)` — so the tone literals live
// in the one semantic registry, not in a `types/*.ts` map (Part II L6 guard-authoring law).
export const CATEGORY_TYPE_META: Record<
  CategoryType,
  { label: string; text: string }
> = {
  income: { label: 'Income', text: 'text-success' },
  expense: { label: 'Expense', text: 'text-error' },
  both: { label: 'Both', text: 'text-info' },
}
