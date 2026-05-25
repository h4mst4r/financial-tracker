/**
 * Collapsible category tree component with chevron rotation, connector lines,
 * subcategory count badges, and drag-and-drop for hierarchy management.
 */
import { useState, useCallback, useRef } from "react";

// --- Drag-and-Drop API helper ---
// Drop target formats:
//   "{id}"              → drop ON category → make dragged item a subcategory of target
//   "top:{id}"          → drop BEFORE a top-level category → make dragged item top-level (unparent if needed)
//   "top:__end__"       → drop after last top-level category → make dragged item top-level
//   "child:{parentId}:{id}" → drop BEFORE a child within its parent → reorder within same parent
//   "child:{parentId}:__end__" → drop after last child within parent
type DropTarget = string | null;

interface DndHandlers {
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  draggedId: string | null;
  dropTarget: DropTarget;
  dropFailedId: string | null;
}

function useCategoryDnd(
  onReparent: (categoryId: string, newParentId: string | null) => Promise<void>,
  allCategories?: Array<{ id: string; parent_id: string | null }> | null
) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const [dropFailedId, setDropFailedId] = useState<string | null>(null);
  const dragTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onDragStart = useCallback((e: React.DragEvent) => {
    const id = (e.currentTarget as HTMLElement).dataset.id;
    if (id) {
      setDraggedId(id);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
    }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const id = (e.currentTarget as HTMLElement).dataset.id;
    if (id) {
      setDropTarget(id);
    }
  }, []);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData("text/plain");
    const targetRaw = (e.currentTarget as HTMLElement).dataset.id;

    if (!sourceId || !targetRaw) {
      setDraggedId(null);
      setDropTarget(null);
      return;
    }

    // Extract the actual category ID from the drop target for self-drop check
    let targetCategoryId = targetRaw;
    if (targetRaw.startsWith("top:")) {
      targetCategoryId = targetRaw.replace("top:", "");
    } else if (targetRaw.startsWith("child:")) {
      const parts = targetRaw.split(":");
      targetCategoryId = parts[2]; // "child:{parentId}:{id}" -> extract {id}
    }

    // Skip if dropping on self or on __end__ marker
    if (sourceId === targetCategoryId || targetCategoryId === "__end__") {
      setDraggedId(null);
      setDropTarget(null);
      return;
    }

    // Validate: system only supports 2-level hierarchy (top-level → subcategory).
    // Any drop that would create a 3rd level is invalid.
    const sourceCat = allCategories?.find(c => c.id === sourceId);
    const targetCat = allCategories?.find(c => c.id === targetRaw);
    const isDropOnCategory = !targetRaw.startsWith("top:") && !targetRaw.startsWith("child:");

    let isDropValid = true;
    if (isDropOnCategory) {
      // Rule 1: Target already has a parent → nesting under it would create 3rd level
      if (targetCat?.parent_id !== null) {
        isDropValid = false;
      }
      // Rule 2: Source has children → they'd become 3rd level under the target
      if (sourceCat && allCategories?.some(c => c.parent_id === sourceId)) {
        isDropValid = false;
      }
    }

    if (!isDropValid) {
      // Invalid drop - trigger wiggle animation on the target
      setDropFailedId(targetRaw);
      setTimeout(() => setDropFailedId(null), 600);
      setDraggedId(null);
      setDropTarget(null);
      return;
    }

    try {
      if (targetRaw.startsWith("top:")) {
        // Drop at top level → unparent (make it a top-level category)
        await onReparent(sourceId, null);
      } else if (targetRaw.startsWith("child:")) {
        // Drop within a parent's children list → keep same parent (just visual reorder,
        // but we still need to ensure the parent_id is correct)
        const parts = targetRaw.split(":");
        const parentId = parts[1];
        await onReparent(sourceId, parentId);
      } else {
        // Drop ON a category → make it a subcategory of that category
        if (sourceId !== targetRaw) {
          await onReparent(sourceId, targetRaw);
        }
      }
    } finally {
      setDraggedId(null);
      setDropTarget(null);
    }
  }, [onReparent, allCategories]);

  const onDragEnd = useCallback(() => {
    // Clear highlight with a small delay so drop can fire first
    dragTimeoutRef.current = setTimeout(() => {
      setDraggedId(null);
      setDropTarget(null);
    }, 100);
  }, []);

  return { onDragStart, onDragOver, onDrop, onDragEnd, draggedId, dropTarget, dropFailedId };
}

// --- Icons ---

function ChevronRightIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    </svg>
  );
}

// --- Types ---

export interface CategoryTreeNode {
  id: string;
  household_id: string | null;
  parent_id: string | null;
  name: string;
  type: string;
  color: string | null;
  icon: string | null;
  is_default: boolean;
  is_archived: boolean;
  children_count: number;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  children: CategoryTreeNode[];
}

interface CategoryTreeProps {
  nodes: CategoryTreeNode[];
  expandedIds?: Set<string>;
  onToggleExpand?: (id: string) => void;
  onEdit?: (node: CategoryTreeNode) => void;
  onArchive?: (id: string) => void;
  onRestore?: (id: string) => void;
  onAddSubcategory?: (parentId: string) => void;
  onReparent?: (categoryId: string, newParentId: string | null) => Promise<void>;
  showActions?: boolean;
  defaultExpanded?: boolean;
  allCategories?: Array<{ id: string; parent_id: string | null }>;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

// --- Subcategory Row ---

function CategoryRow({
  node,
  isExpanded,
  expandedSet,
  onToggleExpand,
  onEdit,
  onArchive,
  onRestore,
  onDeletePermanently,
  onAddSubcategory,
  showActions,
  depth = 0,
  dnd,
  selectedIds,
  onToggleSelect,
}: {
  node: CategoryTreeNode;
  isExpanded: boolean;
  expandedSet?: Set<string>;
  onToggleExpand: (id: string) => void;
  onEdit?: (node: CategoryTreeNode) => void;
  onArchive?: (id: string) => void;
  onRestore?: (id: string) => void;
  onDeletePermanently?: (id: string) => void;
  onAddSubcategory?: (parentId: string) => void;
  showActions?: boolean;
  depth?: number;
  dnd: DndHandlers;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isSystem = node.is_default;
  const isDragged = dnd.draggedId === node.id;
  const isDropTarget = dnd.dropTarget === node.id && !isDragged;
  const isArchived = node.is_archived;
  const isSelected = selectedIds?.has(node.id);

  const bgColor = isArchived ? undefined : `${node.color || "#9E9E9E"}14`;
  const borderColor = isArchived ? undefined : (node.color || "#9E9E9E") + "a0";
  const boxShadow = isArchived ? undefined : `inset 0 0 16px ${(node.color || "#9E9E9E")}30`;

  return (
    <div className="space-y-1">
      {/* Category row */}
      <div
        draggable={!isSystem && !isArchived}
        data-id={node.id}
        onDragStart={dnd.onDragStart}
        onDragOver={dnd.onDragOver}
        onDrop={dnd.onDrop}
        onDragEnd={dnd.onDragEnd}
        className={`flex items-center justify-between p-4 rounded-lg border transition-all cursor-grab active:cursor-grabbing ${
          isArchived ? "opacity-50" : ""
        } ${
          isDragged ? "opacity-40 scale-[0.98]" : ""
        } ${
          isDropTarget ? "ring-2 ring-primary ring-offset-2 ring-offset-background border-primary" : ""
        } ${
          dnd.dropFailedId === node.id ? "animate-wiggle ring-2 ring-error ring-offset-2 ring-offset-background border-error" : ""
        }`}
        style={{ backgroundColor: bgColor, borderColor, boxShadow }}
        title={!isSystem && !isArchived ? "Drag to reparent this category" : undefined}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Checkbox for multi-select */}
          {!isArchived && !isSystem && onToggleSelect && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect(node.id);
              }}
              className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                isSelected
                  ? "bg-purple-500 border-purple-500"
                  : "border-border hover:border-primary"
              }`}
              title={isSelected ? "Deselect" : "Select for merge"}
            >
              {isSelected && (
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          )}
          {/* Expand/collapse chevron */}
          <button
            onClick={() => onToggleExpand(node.id)}
            className={`p-1 rounded transition-transform duration-200 text-text-secondary hover:text-primary ${
              isExpanded ? "rotate-90" : ""
            }`}
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {hasChildren ? <ChevronRightIcon /> : <div className="w-4" />}
          </button>

          {/* Icon */}
          <span className="text-text-secondary flex-shrink-0">
            {hasChildren ? <FolderIcon /> : <FileIcon />}
          </span>

          {/* Name and badges */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium text-text flex items-center gap-1.5 truncate">
              {node.icon && (
                <span className="text-lg flex-shrink-0">{node.icon}</span>
              )}
              {node.name}
            </span>
            {isSystem && (
              <span className="tag tag-success flex-shrink-0">Default</span>
            )}
            {isArchived && (
              <span className="tag tag-error flex-shrink-0">Archived</span>
            )}
            {hasChildren && !isArchived && (
              <span className="tag tag-info flex-shrink-0">
                {node.children.length} subcategor{node.children.length > 1 ? "ies" : "y"}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        {showActions && !isArchived && !isSystem && (
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            {/* Only show "Add Subcategory" on top-level categories (depth === 0) to enforce 2-level max */}
            {depth === 0 && (
              <button
                onClick={() => onAddSubcategory?.(node.id)}
                className="icon-btn"
                title="Add Subcategory"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            )}
            <button
              onClick={() => onEdit?.(node)}
              className="icon-btn"
              title="Edit"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                <path d="m15 5 4 4" />
              </svg>
            </button>
            <button
              onClick={() => onArchive?.(node.id)}
              className="icon-btn icon-btn-error"
              title="Archive"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4" />
              </svg>
            </button>
          </div>
        )}

        {showActions && isArchived && !isSystem && (
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            <button
              onClick={() => onRestore?.(node.id)}
              className="icon-btn icon-btn-success"
              title="Restore"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
            <button
              onClick={() => onDeletePermanently?.(node.id)}
              className="icon-btn icon-btn-error"
              title="Delete Permanently"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Children (indented) */}
      {isExpanded && hasChildren && (
        <div className="ml-8 space-y-1 border-l border-border pl-4">
          {node.children.map((child, childIndex) => {
            const childDropTarget = `child:${node.id}:${child.id}`;
            const isDropTarget = dnd.dropTarget === childDropTarget;
            return (
              <>
                {/* Drop indicator line - shows where subcategory will land */}
                <div
                  key={`drop-before-${child.id}`}
                  data-id={childDropTarget}
                  onDragOver={dnd.onDragOver}
                  onDrop={dnd.onDrop}
                  className={`h-1 mx-2 rounded-full transition-all duration-150 ${
                    isDropTarget
                      ? "bg-primary shadow-[0_0_8px_rgba(79,195,247,0.5)]"
                      : "bg-transparent"
                  }`}
                />
                <CategoryRow
                  key={child.id}
                  node={child}
                  isExpanded={expandedSet?.has(child.id) ?? false}
                  expandedSet={expandedSet}
                  onToggleExpand={onToggleExpand}
                  onEdit={onEdit}
                  onArchive={onArchive}
                  onRestore={onRestore}
                  onDeletePermanently={onDeletePermanently}
                  onAddSubcategory={onAddSubcategory}
                  showActions={showActions}
                  depth={depth + 1}
                  dnd={dnd}
                  selectedIds={selectedIds}
                  onToggleSelect={onToggleSelect}
                />
              </>
            );
          })}
          {/* Drop indicator after last subcategory - drop here to add after last child */}
          <div
            data-id={`child:${node.id}:__end__`}
            onDragOver={dnd.onDragOver}
            onDrop={dnd.onDrop}
            className={`h-1 mx-2 rounded-full transition-all duration-150 ${
              dnd.dropTarget === `child:${node.id}:__end__`
                ? "bg-primary shadow-[0_0_8px_rgba(79,195,247,0.5)]"
                : "bg-transparent"
            }`}
          />
        </div>
      )}
    </div>
  );
}

// --- Main Component ---

export function CategoryTree({
  nodes,
  expandedIds = new Set(),
  onToggleExpand,
  onEdit,
  onArchive,
  onRestore,
  onDeletePermanently,
  onAddSubcategory,
  onReparent,
  showActions = true,
  defaultExpanded = false,
  allCategories,
  selectedIds,
  onToggleSelect,
}: CategoryTreeProps & { onDeletePermanently?: (id: string) => void }) {
  const [localExpanded, setLocalExpanded] = useState<Set<string>>(
    defaultExpanded ? new Set(nodes.map((n) => n.id)) : expandedIds
  );

  const handleToggle = (id: string) => {
    const next = new Set(localExpanded);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setLocalExpanded(next);
    onToggleExpand?.(id);
  };

  // DnD hook for drag-and-drop reparenting
  const dnd = useCategoryDnd(onReparent || (() => Promise.resolve()), allCategories);

  if (nodes.length === 0) {
    return (
      <div className="empty-state bg-surface/30 rounded-lg border border-border py-12 text-center">
        <p>No categories yet. Create your first category to get started.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-1">
        {nodes.map((node, index) => {
          const topDropTarget = `top:${node.id}`;
          const isDropTarget = dnd.dropTarget === topDropTarget;
          return (
            <>
              {/* Drop zone - wider hit area for reliable mouse targeting */}
              <div
                data-id={topDropTarget}
                onDragOver={dnd.onDragOver}
                onDrop={dnd.onDrop}
                className={`h-6 flex items-center mx-4 rounded transition-all duration-150 ${
                  isDropTarget
                    ? "bg-primary/10"
                    : "bg-transparent"
                }`}
              >
                {/* Visual indicator line - thin, centered in the hit area */}
                <div className={`h-0.5 w-full rounded-full transition-all duration-150 ${
                  isDropTarget
                    ? "bg-primary shadow-[0_0_8px_rgba(79,195,247,0.5)]"
                    : "bg-transparent"
                }`}
                />
              </div>
              <CategoryRow
                key={node.id}
                node={node}
                isExpanded={localExpanded.has(node.id)}
                expandedSet={localExpanded}
                onToggleExpand={handleToggle}
                onEdit={onEdit}
                onArchive={onArchive}
                onRestore={onRestore}
                onDeletePermanently={onDeletePermanently}
                onAddSubcategory={onAddSubcategory}
                showActions={showActions}
                depth={0}
                dnd={dnd}
                selectedIds={selectedIds}
                onToggleSelect={onToggleSelect}
              />
            </>
          );
        })}
        {/* Drop zone after last category - wider hit area for reliable mouse targeting */}
        {nodes.length > 0 && (
          <div
            data-id={`top:__end__`}
            onDragOver={dnd.onDragOver}
            onDrop={dnd.onDrop}
            className={`h-6 flex items-center mx-4 rounded transition-all duration-150 ${
              dnd.dropTarget === `top:__end__`
                ? "bg-primary/10"
                : "bg-transparent"
            }`}
          >
            {/* Visual indicator line - thin, centered in the hit area */}
            <div className={`h-0.5 w-full rounded-full transition-all duration-150 ${
              dnd.dropTarget === `top:__end__`
                ? "bg-primary shadow-[0_0_8px_rgba(79,195,247,0.5)]"
                : "bg-transparent"
            }`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
