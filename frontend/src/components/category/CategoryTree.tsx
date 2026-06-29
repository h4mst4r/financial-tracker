import { useState } from 'react'
import type { CSSProperties } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { ACTION_ICON, CONTROL_ICON } from '../../config/iconRegistry'
import { ContextMenu } from '../primitives/ContextMenu'
import type { ContextMenuEntry } from '../primitives/ContextMenu'
import { GlyphView } from '../primitives/EmojiIconPicker'
import { Badge } from '../primitives/Badge'
import { Checkbox } from '../primitives/Checkbox'
import { Zone } from '../primitives/Zone'
import type { Category } from '../../types/category'
import { CATEGORY_TYPE_META } from '../../types/category'
import { badgeVariantForStatus } from '../../config/statusRegistry'
import { resolveMove, ROOT_DROPPABLE, PARENT_PREFIX } from './resolveMove'
import { useEntityFill } from '../../theme/useEntityFill'

// Glyphs via the icon registry (L14). Aliased so the flat-strip render sites (§2.11) read unchanged.
const GripVertical = ACTION_ICON.drag
const MoreVertical = ACTION_ICON.more
const Plus = ACTION_ICON.add
const ArrowUpToLine = ACTION_ICON.promote
const ChevronRight = CONTROL_ICON.chevronRight
const Minus = CONTROL_ICON.leaf

// CategoryTree (UX §6 / frontend.md §2.11) — the ONE sanctioned EntityCard exception: a flat
// flex-strip tree, not a card grid. Parent rows carry a calm colour-tint fill; sub rows a lighter
// tint of the PARENT's colour (no chip, no connector line, no left accent bar). Row actions live in
// a `⋮` ContextMenu. Story 3.2: archive/restore, hard-delete (disabled-with-reason), and
// promote/re-parent via the `⋮` menu (Promote to top level / Move to…) AND drag.
//
// Drag uses **@dnd-kit/core** (not native HTML5 DnD — that proved unreliable for nested sub rows;
// see SCP 2026-06-20). A handle (grip) on each movable row is the drag activator; parent blocks and
// the promote zone are droppables. The move decision is the pure `resolveMove` (unit-tested).
//
// Movable rows (max 2 levels): a **subcategory** (drop on a parent block = re-parent; on the promote
// zone = promote) or a **childless top-level** (drop on a parent block = nest). A top-level *with
// children* can't move, so it isn't draggable and carries no grip. Reorder-within-a-level is deferred.

interface RowFill {
  style: CSSProperties
  /** The fill background utility (calm/vivid for parents, the 9% sub-tint for sub rows). */
  fillClass: string
  /** Primary text (name) foreground — contrast pole on vivid, the entity-fg pole on calm. */
  textClass: string
  /** Control glyphs (grip · chevron · ⋮) — the contrast pole on vivid (so they don't vanish into the
   *  saturated fill), the raw instance colour on calm. */
  iconClass: string
}

// The ONE row-fill helper for both row kinds — a thin skin over the shared `useEntityFill` seam
// (FR-SYS-016), so a user-picked colour ramp-snaps on immersive themes AND the per-instance vivid opt-in
// actually renders. A **parent** takes calm/vivid; a **sub** is always the lighter parent-tint
// (`bg-entity-fill-sub`, 9% of the resolved parent colour, calm only — spec §6 "lighter parent-tint").
// `sub` just swaps the fill class; the resolved `--entity-colour` and the calm text/icon poles are
// identical, so there is no second helper. The faint leaf glyph (`–`) uses `text-entity-faint` directly
// at its one call site — it is vivid-aware (the seam sets `--entity-text-faint` on a vivid fill).
function useRowFill(colour: string, { vivid = false, sub = false }: { vivid?: boolean; sub?: boolean }): RowFill {
  const fill = useEntityFill(colour, vivid)
  return {
    style: fill.style,
    fillClass: sub ? 'bg-entity-fill-sub' : fill.fillClass,
    textClass: fill.textClass,
    iconClass: fill.vivid ? 'text-on-entity' : 'text-entity',
  }
}

function isArchived(c: Category): boolean {
  return c.status === 'archived'
}

function TypeBadge({ type }: { type: Category['category_type'] }) {
  return <Badge variant={badgeVariantForStatus('categoryType', type)}>{CATEGORY_TYPE_META[type].label}</Badge>
}

// Sub-count is the §6 neutral `Badge` ("N subs"), not a bespoke pill — every count/status chip is the
// one Badge primitive (spec line 732).
function SubCountBadge({ count }: { count: number }) {
  return (
    <Badge variant="neutral" className="shrink-0">
      {count} {count === 1 ? 'sub' : 'subs'}
    </Badge>
  )
}

function RowMenu({ items, label, iconClass }: { items: ContextMenuEntry[]; label: string; iconClass: string }) {
  return (
    <ContextMenu
      trigger={
        <MoreVertical
          size={14}
          aria-label={label}
          className={`${iconClass} opacity-60 hover:opacity-100 shrink-0`}
        />
      }
      items={items}
    />
  )
}

// The standard destructive tail every row's ⋮ menu shares (UX §8.1): Archive/Restore by state, then
// Delete (disabled with a reason when the category still has dependencies). An **archived** row is
// adaptive per state (UX §8.1): only Restore + Delete — no Edit / Add-sub / Promote / Move (the
// `activePrefix`), since you don't restructure an archived category.
function rowMenu(
  category: Category,
  activePrefix: ContextMenuEntry[],
  onArchive: (c: Category) => void,
  onRestore: (c: Category) => void,
  onDelete: (c: Category) => void,
): ContextMenuEntry[] {
  const del: ContextMenuEntry = {
    label: 'Delete',
    destructive: true,
    disabled: !category.can_delete,
    disabledReason: category.delete_blocked_reason ?? undefined,
    onClick: () => onDelete(category),
  }
  if (isArchived(category)) {
    return [{ label: 'Restore', onClick: () => onRestore(category) }, del]
  }
  return [
    ...activePrefix,
    { divider: true },
    { label: 'Archive', onClick: () => onArchive(category) },
    del,
  ]
}

/** The grip drag-activator — wires @dnd-kit's listeners/attributes onto a small handle so the rest
 *  of the row (chevron, ⋮) stays clickable. */
function DragHandle({
  attributes,
  listeners,
  setActivatorNodeRef,
  label,
  iconClass,
}: {
  attributes: ReturnType<typeof useDraggable>['attributes']
  listeners: ReturnType<typeof useDraggable>['listeners']
  setActivatorNodeRef: (el: HTMLElement | null) => void
  label: string
  iconClass: string
}) {
  return (
    <button
      type="button"
      ref={setActivatorNodeRef}
      aria-label={label}
      className={`shrink-0 cursor-grab active:cursor-grabbing ${iconClass} opacity-40 group-hover:opacity-100 transition-opacity focus:outline-none focus:opacity-100`}
      {...attributes}
      {...listeners}
    >
      <GripVertical size={14} aria-hidden />
    </button>
  )
}

interface RowProps {
  category: Category
  draggable: boolean
  color: string
  menu: ContextMenuEntry[]
  selected: boolean
  onToggleSelect: () => void
}

function ParentRow({
  category,
  draggable,
  color,
  menu,
  selected,
  onToggleSelect,
  childCount,
  isOpen,
  onToggle,
}: RowProps & { childCount: number; isOpen: boolean; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: category.id,
    disabled: !draggable,
  })
  const archived = isArchived(category)
  // Calm/vivid fill via the shared seam (FR-SYS-016) — a vivid category renders bg-entity-fill-vivid,
  // with control glyphs on the contrast pole (text-on-entity) so they don't vanish into the fill.
  const fill = useRowFill(color, { vivid: category.vivid })
  return (
    // The selection ring lives on a wrapper OUTSIDE the `.archived` grayscale filter, so selecting an
    // archived row keeps an accent (not grey) ring — the filter would otherwise desaturate the ring too.
    <div className={`rounded-md ${selected ? 'ring-2 ring-accent' : ''}`}>
      <div
        ref={setNodeRef}
        data-testid="category-tree-row"
        data-selected={selected || undefined}
        className={`group flex items-center gap-2 h-11 pl-2 pr-3 rounded-md transition-all duration-100 ${fill.fillClass} ${
          archived ? 'archived border border-dashed border-border-strong' : ''
        } ${isDragging ? 'opacity-40' : ''}`}
        style={fill.style}
      >
        <Checkbox
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Select ${category.name}`}
        />
        {draggable && (
          <DragHandle
            attributes={attributes}
            listeners={listeners}
            setActivatorNodeRef={setActivatorNodeRef}
            label={`Drag ${category.name}`}
            iconClass={fill.iconClass}
          />
        )}
        {childCount > 0 ? (
          <button
            type="button"
            aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${category.name}`}
            onClick={onToggle}
            className="shrink-0 focus:outline-none"
          >
            <ChevronRight
              size={14}
              className={`${fill.iconClass} transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}
            />
          </button>
        ) : (
          // text-entity-faint is vivid-aware (the seam sets --entity-text-faint on a vivid fill), so the
          // same §2 emphasis utility stays legible in both modes — no opacity (L3).
          <Minus size={14} className="text-entity-faint shrink-0" />
        )}
        <span className="flex items-center justify-center size-6 shrink-0">
          {category.icon ? <GlyphView glyph={category.icon} size={20} /> : null}
        </span>
        <span className={`text-sm font-medium ${fill.textClass} flex-1 truncate min-w-0`}>
          {category.name}
        </span>
        {archived && <Badge variant="neutral">Archived</Badge>}
        {childCount > 0 && <SubCountBadge count={childCount} />}
        <TypeBadge type={category.category_type} />
        <RowMenu items={menu} label={`Actions for ${category.name}`} iconClass={fill.iconClass} />
      </div>
    </div>
  )
}

function SubRow({ category, draggable, color, menu, selected, onToggleSelect }: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: category.id,
    disabled: !draggable,
  })
  const archived = isArchived(category)
  const fill = useRowFill(color, { sub: true })
  return (
    // Selection ring on a wrapper outside the `.archived` grayscale filter (see ParentRow).
    <div className={`rounded-md ${selected ? 'ring-2 ring-accent' : ''}`}>
      <div
        ref={setNodeRef}
        data-testid="category-tree-row"
        data-selected={selected || undefined}
        className={`group flex items-center gap-2 h-10 pl-2 pr-3 rounded-md transition-all duration-100 ${fill.fillClass} ${
          archived ? 'archived border border-dashed border-border-strong' : ''
        } ${isDragging ? 'opacity-40' : ''}`}
        style={fill.style}
      >
        <Checkbox
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Select ${category.name}`}
        />
        {draggable && (
          <DragHandle
            attributes={attributes}
            listeners={listeners}
            setActivatorNodeRef={setActivatorNodeRef}
            label={`Drag ${category.name}`}
            iconClass={fill.iconClass}
          />
        )}
        {/* Sub rows carry no glyph — name only (UX §6 / bible CategoryTree). */}
        <span className={`text-sm ${fill.textClass} flex-1 truncate min-w-0`}>{category.name}</span>
        {archived && <Badge variant="neutral">Archived</Badge>}
        <TypeBadge type={category.category_type} />
        <RowMenu items={menu} label={`Actions for ${category.name}`} iconClass={fill.iconClass} />
      </div>
    </div>
  )
}

/** A parent + its children — the droppable block that accepts a re-parent/nest. */
function ParentBlock({
  parent,
  subcategories,
  color,
  draggable,
  childDraggable,
  validDrop,
  isOpen,
  onToggle,
  parentMenu,
  childMenu,
  onAddSubcategory,
  selectedIds,
  onToggleSelect,
}: {
  parent: Category
  subcategories: Category[]
  color: string
  draggable: boolean
  childDraggable: (c: Category) => boolean
  validDrop: boolean
  isOpen: boolean
  onToggle: () => void
  parentMenu: ContextMenuEntry[]
  childMenu: (c: Category) => ContextMenuEntry[]
  onAddSubcategory: (parent: Category) => void
  selectedIds: ReadonlySet<string>
  onToggleSelect: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: PARENT_PREFIX + parent.id })
  return (
    <div
      ref={setNodeRef}
      className={`rounded-md transition-all duration-100 ${isOver && validDrop ? 'ring-2 ring-primary' : ''}`}
    >
      <ParentRow
        category={parent}
        draggable={draggable}
        color={color}
        menu={parentMenu}
        selected={selectedIds.has(parent.id)}
        onToggleSelect={() => onToggleSelect(parent.id)}
        childCount={subcategories.length}
        isOpen={isOpen}
        onToggle={onToggle}
      />
      {isOpen && subcategories.length > 0 && (
        <div className="ml-7 mt-1 flex flex-col gap-1">
          {subcategories.map((child) => (
            <SubRow
              key={child.id}
              category={child}
              draggable={childDraggable(child)}
              color={color}
              menu={childMenu(child)}
              selected={selectedIds.has(child.id)}
              onToggleSelect={() => onToggleSelect(child.id)}
            />
          ))}
          <button
            type="button"
            onClick={() => onAddSubcategory(parent)}
            className="flex items-center gap-1 pl-2 h-8 text-xs text-text-default hover:text-text-strong focus:outline-none"
          >
            <Plus size={14} /> Add subcategory
          </button>
        </div>
      )}
    </div>
  )
}

function RootDropZone() {
  const { setNodeRef, isOver } = useDroppable({ id: ROOT_DROPPABLE })
  // The promote drop-target is a Zone (UX §10 dashed) — its drag-over highlight is the Zone `active`
  // state (§6 solid accent-primary ring). No hand-rolled dashed div.
  return (
    <Zone
      ref={setNodeRef}
      data-testid="category-tree-root-dropzone"
      border="dashed"
      active={isOver}
      className="flex h-9 items-center gap-2 px-3 text-xs"
    >
      <ArrowUpToLine size={14} className="shrink-0" /> Drop here to make top-level
    </Zone>
  )
}

function DragChip({ category }: { category: Category }) {
  return (
    <div className="flex items-center gap-2 h-10 px-3 rounded-md bg-surface-overlay border border-border-strong shadow-lg text-sm text-text-strong cursor-grabbing">
      {category.icon ? <GlyphView glyph={category.icon} size={18} /> : null}
      <span className="font-medium">{category.name}</span>
    </div>
  )
}

interface CategoryTreeProps {
  items: Category[]
  onEdit: (category: Category) => void
  onAddSubcategory: (parent: Category) => void
  onArchive: (category: Category) => void
  onRestore: (category: Category) => void
  onDelete: (category: Category) => void
  /** Promote (parentId=null) or re-parent/nest (parentId=<top-level>). Shared by ⋮ and drag. */
  onMove: (id: string, parentId: string | null) => void
  /** Multi-select (Story 3.4, FR-E-020) — owned by the page's useMultiSelect; the tree just renders
   *  the per-row checkbox + selected fill. */
  selectedIds: ReadonlySet<string>
  onToggleSelect: (id: string) => void
}

export function CategoryTree({
  items,
  onEdit,
  onAddSubcategory,
  onArchive,
  onRestore,
  onDelete,
  onMove,
  selectedIds,
  onToggleSelect,
}: CategoryTreeProps) {
  const parents = items.filter((c) => c.depth === 0)
  const childrenOf = (parentId: string) =>
    items.filter((c) => c.depth === 1 && c.parent_id === parentId)
  const hasChildren = (id: string) => items.some((c) => c.parent_id === id)
  // A row is movable iff it has a valid move: a sub, or a childless top-level.
  const canDrag = (c: Category) => !isArchived(c) && (c.depth === 1 || !hasChildren(c.id))

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const [activeCat, setActiveCat] = useState<Category | null>(null)
  // A small distance constraint so a click on the grip (or ⋮ / chevron) isn't read as a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )

  const onDragStart = (e: DragStartEvent) =>
    setActiveCat(items.find((c) => c.id === e.active.id) ?? null)
  const onDragEnd = (e: DragEndEvent) => {
    setActiveCat(null)
    const move = resolveMove(String(e.active.id), e.over ? String(e.over.id) : null, items)
    if (move) onMove(move.id, move.parentId)
  }

  // Only a subcategory can be promoted to the root, so only show the promote zone for one.
  const showPromoteZone = activeCat?.depth === 1
  const moveTargetsFor = (parentId: string) =>
    parents.filter((p) => p.id !== parentId && !isArchived(p))

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveCat(null)}
    >
      <div className="flex flex-col gap-1">
        {showPromoteZone && <RootDropZone />}
        {parents.map((parent) => {
          const children = childrenOf(parent.id)
          const parentMenu = rowMenu(
            parent,
            [
              { label: 'Edit', onClick: () => onEdit(parent) },
              { label: 'Add subcategory', onClick: () => onAddSubcategory(parent) },
            ],
            onArchive,
            onRestore,
            onDelete,
          )
          const childMenu = (child: Category): ContextMenuEntry[] =>
            rowMenu(
              child,
              [
                { label: 'Edit', onClick: () => onEdit(child) },
                { label: 'Promote to top level', onClick: () => onMove(child.id, null) },
                ...moveTargetsFor(parent.id).map((target) => ({
                  label: `Move to ${target.name}`,
                  onClick: () => onMove(child.id, target.id),
                })),
              ],
              onArchive,
              onRestore,
              onDelete,
            )
          const validDrop =
            !!activeCat && resolveMove(activeCat.id, PARENT_PREFIX + parent.id, items) !== null
          return (
            <ParentBlock
              key={parent.id}
              parent={parent}
              subcategories={children}
              color={parent.color}
              draggable={canDrag(parent)}
              childDraggable={(c) => canDrag(c)}
              validDrop={validDrop}
              isOpen={!collapsed.has(parent.id)}
              onToggle={() => toggle(parent.id)}
              parentMenu={parentMenu}
              childMenu={childMenu}
              onAddSubcategory={onAddSubcategory}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
            />
          )
        })}
      </div>
      <DragOverlay>{activeCat ? <DragChip category={activeCat} /> : null}</DragOverlay>
    </DndContext>
  )
}
