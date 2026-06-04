import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '../ui/Button';
import { Toggle } from '../ui/Toggle';
import { Icon } from '../ui/Icon';
import { Plus } from 'lucide-react';
import { BulkActionBar } from './BulkActionBar';

export interface EntityPageProps<T extends Record<string, unknown>> {
  /** Items to render — filtered list from useEntityManager */
  items?: T[];
  onCreateClick: () => void;
  showFilterBar?: boolean;
  /** Entity-specific extra action buttons placed left of Create */
  actions?: React.ReactNode;
  /** Page title shown in the action bar */
  title?: string;
  /** Called when Show Archived toggle changes */
  onShowArchivedChange?: (showArchived: boolean) => void;
  /**
   * Render a card for each item.
   * Third arg is EntityPage's selection handler — wire it to EntityCard's `onSelect`
   * so that Ctrl+click, Shift+click, Ctrl+A, and Escape all work from one source of truth.
   */
  renderCard?: (
    entity: T,
    selected: boolean,
    onSelect: (id: string, modifiers: { ctrl: boolean; shift: boolean }) => void,
  ) => React.ReactNode;
  /** Called with ids of selected items when bulk archive is triggered */
  onBulkArchive?: (ids: string[]) => void;
  /** Called with ids of selected items when bulk delete is triggered */
  onBulkDelete?: (ids: string[]) => void;
  /** Falls back to children if renderCard is not provided */
  children?: React.ReactNode;
}

export function EntityPage<T extends Record<string, unknown>>({
  items = [],
  onCreateClick,
  showFilterBar = false,
  actions,
  title,
  onShowArchivedChange,
  renderCard,
  onBulkArchive,
  onBulkDelete,
  children,
}: EntityPageProps<T>) {
  const [showArchived, setShowArchived] = useState(false);
  // Multi-select state [G-12]
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Track ordered list of item ids for Shift+click range select
  const itemIds = items.map((e) => String(e.id ?? ''));

  // Clear selection when items change (e.g. after archive)
  useEffect(() => {
    setSelectedIds(new Set());
  }, [items.length]);

  const handleShowArchivedChange = useCallback(
    (value: boolean) => {
      setShowArchived(value);
      onShowArchivedChange?.(value);
    },
    [onShowArchivedChange],
  );

  // Multi-select handler — Ctrl+click toggle, Shift+click range, plain click single [G-12]
  const handleSelect = useCallback(
    (id: string, { ctrl, shift }: { ctrl: boolean; shift: boolean }) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (shift && prev.size > 0) {
          // Range select: find the last selected item and select everything between
          const lastSelected = [...prev].at(-1) ?? id;
          const fromIdx = itemIds.indexOf(lastSelected);
          const toIdx = itemIds.indexOf(id);
          if (fromIdx !== -1 && toIdx !== -1) {
            const [lo, hi] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
            itemIds.slice(lo, hi + 1).forEach((rid) => next.add(rid));
          } else {
            next.add(id);
          }
        } else if (ctrl) {
          if (next.has(id)) next.delete(id);
          else next.add(id);
        } else {
          // Plain click — clear selection and select only this one
          next.clear();
          next.add(id);
        }
        return next;
      });
    },
    [itemIds],
  );

  // Ctrl+A: select all; Escape: clear selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        if (inInput) return;
        e.preventDefault();
        setSelectedIds(new Set(itemIds));
      } else if (e.key === 'Escape' && selectedIds.size > 0) {
        setSelectedIds(new Set());
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [itemIds, selectedIds.size]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleBulkArchive = useCallback(() => {
    onBulkArchive?.([...selectedIds]);
    clearSelection();
  }, [selectedIds, onBulkArchive, clearSelection]);

  const handleBulkDelete = useCallback(() => {
    onBulkDelete?.([...selectedIds]);
    clearSelection();
  }, [selectedIds, onBulkDelete, clearSelection]);

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {title && (
            <h1 className="text-2xl font-bold text-text-primary">{title}</h1>
          )}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">Show Archived</span>
            <Toggle
              checked={showArchived}
              onChange={handleShowArchivedChange}
              aria-label="Show Archived"
            />
          </div>
          <Button onClick={onCreateClick}>
            <Icon icon={Plus} size="sm" className="shrink-0" />
            Create
          </Button>
        </div>
      </div>

      {/* VisualizationFilterBar slot */}
      {showFilterBar && (
        <div className="bg-surface-raised rounded-lg p-4 border border-border">
          <p className="text-sm text-text-muted">
            Filter bar slot — pass VisualizationFilterBar as children or prop
          </p>
        </div>
      )}

      {/* Item grid / list */}
      {renderCard ? (
        <div className="grid gap-3">
          {items.map((entity) => {
            const id = String(entity.id ?? '');
            return (
              <React.Fragment key={id}>
                {renderCard(entity, selectedIds.has(id), handleSelect)}
              </React.Fragment>
            );
          })}
          {items.length === 0 && (
            <p className="text-sm text-text-muted text-center py-12">
              No items found. Click Create to add one.
            </p>
          )}
        </div>
      ) : (
        <div>{children}</div>
      )}

      {/* Bulk action bar — appears when ≥1 item selected [G-12] */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        onArchive={onBulkArchive ? handleBulkArchive : undefined}
        onDelete={onBulkDelete ? handleBulkDelete : undefined}
        onClear={clearSelection}
      />
    </div>
  );
}
