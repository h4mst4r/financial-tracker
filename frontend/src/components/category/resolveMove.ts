import type { Category } from '../../types/category'

// The CategoryTree drag outcome, as a pure function (Story 3.2). Kept out of CategoryTree.tsx so the
// drag *decision* is unit-tested without driving a real @dnd-kit gesture (jsdom can't), and so the
// component file only exports components (react-refresh). The droppable ids are owned here too.

export const ROOT_DROPPABLE = 'root'
export const PARENT_PREFIX = 'parent:'

export interface ResolvedMove {
  id: string
  parentId: string | null
}

/** Decide the move for a drop, or null if it's a no-op / illegal (keeps the tree ≤ 2 levels). */
export function resolveMove(
  activeId: string,
  overId: string | null,
  items: Category[],
): ResolvedMove | null {
  const active = items.find((c) => c.id === activeId)
  if (!active || !overId) return null

  if (overId === ROOT_DROPPABLE) {
    // Only a subcategory promotes; a top-level is already at the root.
    return active.depth === 1 ? { id: activeId, parentId: null } : null
  }
  if (overId.startsWith(PARENT_PREFIX)) {
    const targetId = overId.slice(PARENT_PREFIX.length)
    const target = items.find((c) => c.id === targetId)
    if (!target || target.status === 'archived') return null // can't nest under an archived parent
    if (activeId === targetId) return null // onto itself
    if (active.parent_id === targetId) return null // already a child of this parent
    if (items.some((c) => c.parent_id === activeId)) return null // has children → would be 3 levels
    return { id: activeId, parentId: targetId }
  }
  return null
}
