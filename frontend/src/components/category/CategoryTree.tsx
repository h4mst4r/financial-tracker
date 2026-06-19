import { useState, type CSSProperties } from 'react'
import { GripVertical, ChevronRight, Minus, MoreVertical, Plus } from 'lucide-react'
import { ContextMenu } from '../primitives/ContextMenu'
import type { ContextMenuEntry } from '../primitives/ContextMenu'
import { GlyphView } from '../primitives/EmojiIconPicker'
import { Badge } from '../primitives/Badge'
import type { Category } from '../../types/category'
import { CATEGORY_TYPE_META } from '../../types/category'

// CategoryTree (UX §6 / frontend.md §2.11) — the ONE sanctioned EntityCard exception: a flat
// flex-strip tree, not a card grid. Parent rows carry a calm colour-tint fill of their own colour;
// subcategory rows a lighter tint of the PARENT's colour (no chip, no connector line, no left
// accent bar). Row actions live in a `⋮` ContextMenu — Edit + Add subcategory only in Story 3.1
// (archive/promote/re-parent/delete are Story 3.2; drag-reorder is 3.2, so the grip is decorative
// for now). It still reuses EntityPage/EntityModal/useEntityManager via the consuming page.

interface CategoryTreeProps {
  items: Category[]
  onEdit: (category: Category) => void
  onAddSubcategory: (parent: Category) => void
}

function fillVar(colour: string): CSSProperties {
  return { '--entity-colour': colour } as CSSProperties
}

function TypeBadge({ type }: { type: Category['category_type'] }) {
  const meta = CATEGORY_TYPE_META[type]
  return <Badge variant={meta.badge}>{meta.label}</Badge>
}

// Sub-count pill ("N subs", bible.css `.pill`).
function SubCountPill({ count }: { count: number }) {
  return (
    <span className="inline-block text-2xs px-2 py-px rounded-full bg-surface-active text-text-secondary shrink-0">
      {count} {count === 1 ? 'sub' : 'subs'}
    </span>
  )
}

function RowMenu({ items, label }: { items: ContextMenuEntry[]; label: string }) {
  return (
    <ContextMenu
      trigger={
        <MoreVertical
          size={14}
          aria-label={label}
          className="text-text-muted opacity-60 hover:opacity-100 shrink-0"
        />
      }
      items={items}
    />
  )
}

export function CategoryTree({ items, onEdit, onAddSubcategory }: CategoryTreeProps) {
  const parents = items.filter((c) => c.depth === 0)
  const childrenOf = (parentId: string) =>
    items.filter((c) => c.depth === 1 && c.parent_id === parentId)

  // Track COLLAPSED ids (default = expanded) so categories added after mount render expanded, not
  // collapsed (a fresh-init `expanded` set wouldn't include them).
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="flex flex-col gap-1">
      {parents.map((parent) => {
        const children = childrenOf(parent.id)
        const isOpen = !collapsed.has(parent.id)
        const parentMenu: ContextMenuEntry[] = [
          { label: 'Edit', onClick: () => onEdit(parent) },
          { label: 'Add subcategory', onClick: () => onAddSubcategory(parent) },
        ]
        return (
          <div key={parent.id}>
            <div
              data-testid="category-tree-row"
              className="group flex items-center gap-2 h-11 pl-3 pr-3 rounded-md bg-entity-fill-calm transition-all duration-100"
              style={fillVar(parent.color)}
            >
              <GripVertical
                size={14}
                className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0 cursor-grab"
              />
              {children.length > 0 ? (
                <button
                  type="button"
                  aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${parent.name}`}
                  onClick={() => toggle(parent.id)}
                  className="shrink-0 focus:outline-none"
                >
                  <ChevronRight
                    size={14}
                    className={`text-text-secondary transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}
                  />
                </button>
              ) : (
                <Minus size={14} className="text-text-muted shrink-0" />
              )}
              <span className="flex items-center justify-center size-6 shrink-0">
                {parent.icon ? <GlyphView glyph={parent.icon} size={20} /> : null}
              </span>
              <span className="text-sm font-medium text-text-primary flex-1 truncate min-w-0">
                {parent.name}
              </span>
              {children.length > 0 && <SubCountPill count={children.length} />}
              <TypeBadge type={parent.category_type} />
              <RowMenu items={parentMenu} label={`Actions for ${parent.name}`} />
            </div>

            {isOpen && children.length > 0 && (
              <div className="ml-7 mt-1 flex flex-col gap-1">
                {children.map((child) => (
                  <div
                    key={child.id}
                    data-testid="category-tree-row"
                    className="group flex items-center gap-2 h-10 pl-4 pr-3 rounded-md bg-entity-fill-sub transition-all duration-100"
                    style={fillVar(parent.color)}
                  >
                    <GripVertical
                      size={14}
                      className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0 cursor-grab"
                    />
                    {/* Sub rows carry no glyph — name only (UX §6 / bible CategoryTree). */}
                    <span className="text-sm text-text-primary flex-1 truncate min-w-0">
                      {child.name}
                    </span>
                    <TypeBadge type={child.category_type} />
                    <RowMenu
                      items={[{ label: 'Edit', onClick: () => onEdit(child) }]}
                      label={`Actions for ${child.name}`}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => onAddSubcategory(parent)}
                  className="flex items-center gap-1 pl-4 h-8 text-xs text-text-secondary hover:text-text-primary focus:outline-none"
                >
                  <Plus size={14} /> Add subcategory
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
