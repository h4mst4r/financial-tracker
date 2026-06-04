import React from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { ContextMenu } from '../ui/ContextMenu';
import type { ContextMenuItem } from '../ui/ContextMenu';
import { formatDate } from '../../utils/date';

export interface EntityCardProps<T extends Record<string, unknown>> {
  entity: T;
  entityAccent?: string;
  /** Whether this card is currently selected (multi-select) */
  selected?: boolean;
  /** Called with the entity id and modifier keys for multi-select logic */
  onSelect?: (id: string, modifiers: { ctrl: boolean; shift: boolean }) => void;
  onClick?: () => void;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  onDelete?: () => void;
  renderBody?: (entity: T) => React.ReactNode;
  children?: React.ReactNode;
}

export function EntityCard<T extends Record<string, unknown>>({
  entity,
  entityAccent = 'var(--color-primary)',
  selected = false,
  onSelect,
  onClick,
  onEdit,
  onDuplicate,
  onArchive,
  onRestore,
  onDelete,
  renderBody,
  children,
}: EntityCardProps<T>) {
  const archived = entity.archived as boolean | undefined;
  // Use camelCase per EDP §15.2 [G-06]
  const updatedAt = entity.updatedAt as string | undefined;

  const contextItems: ContextMenuItem[] = [];

  if (onEdit) contextItems.push({ label: 'Edit', onClick: onEdit });
  if (onDuplicate) contextItems.push({ label: 'Duplicate', onClick: onDuplicate });
  contextItems.push({ divider: true });
  if (archived) {
    if (onRestore) contextItems.push({ label: 'Restore', onClick: onRestore });
  } else {
    if (onArchive) contextItems.push({ label: 'Archive', onClick: onArchive });
  }
  contextItems.push({ divider: true });
  if (onDelete) contextItems.push({ label: 'Delete', onClick: onDelete, destructive: true });

  const getStatusLabel = (): string => {
    if (archived) return 'Archived';
    const status = entity.status as string;
    if (!status) return 'Active';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const getBadgeVariant = (): 'success' | 'warning' | 'error' | 'info' | 'neutral' => {
    if (archived) return 'neutral';
    const status = entity.status as string;
    if (status === 'active') return 'success';
    if (status === 'inactive') return 'warning';
    if (status === 'archived') return 'neutral';
    return 'info';
  };

  const handleClick = (e: React.MouseEvent) => {
    if (onSelect) {
      const id = String(entity.id ?? '');
      onSelect(id, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
      return;
    }
    onClick?.();
  };

  return (
    <div
      className={`transition-shadow duration-150 ${selected ? 'ring-2 ring-primary rounded-lg' : ''}`}
      data-testid="entity-card"
    >
      <Card
        variant="default"
        entityAccent={entityAccent}
        onClick={handleClick}
        style={{ opacity: archived ? 0.6 : 1 }}
      >
        {/* Header: name + badge + context menu all in one row — no overlap */}
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-base font-semibold text-text-primary truncate flex-1">
            {(entity.name as string) || String(entity.id ?? '')}
          </h3>
          <Badge variant={getBadgeVariant()} className="shrink-0">{getStatusLabel()}</Badge>
          {contextItems.length > 0 && (
            <div className="shrink-0">
              <ContextMenu items={contextItems} />
            </div>
          )}
        </div>

        {(renderBody || children) && (
          <div className="mt-3">
            {renderBody ? renderBody(entity) : children}
          </div>
        )}

        <div className="mt-3 text-xs text-text-muted">
          {updatedAt ? `Updated ${formatDate(updatedAt)}` : 'No update date'}
        </div>
      </Card>
    </div>
  );
}
