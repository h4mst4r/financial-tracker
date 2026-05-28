import React from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { ContextMenu } from '../ui/ContextMenu';
import type { ContextMenuItem } from '../ui/ContextMenu';

export interface EntityCardProps<T extends Record<string, unknown>> {
  entity: T;
  entityAccent?: string;
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
  entityAccent = '--color-text-primary',
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

  const contextItems: ContextMenuItem[] = [];

  if (onEdit) {
    contextItems.push({ label: 'Edit', onClick: onEdit });
  }

  if (onDuplicate) {
    contextItems.push({ label: 'Duplicate', onClick: onDuplicate });
  }

  contextItems.push({ divider: true });

  if (archived) {
    if (onRestore) {
      contextItems.push({ label: 'Restore', onClick: onRestore });
    }
  } else {
    if (onArchive) {
      contextItems.push({ label: 'Archive', onClick: onArchive });
    }
  }

  contextItems.push({ divider: true });

  if (onDelete) {
    contextItems.push({ label: 'Delete', onClick: onDelete, destructive: true });
  }

  const getStatusLabel = (): string => {
    if (archived) return 'Archived';
    const status = entity.status as string;
    if (!status) return 'Active';
    // Capitalize first letter for display
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const getBadgeVariant = (): 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'entity' => {
    if (archived) return 'neutral';
    const status = entity.status as string;
    if (status === 'active') return 'success';
    if (status === 'warning') return 'warning';
    if (status === 'error') return 'error';
    return 'info';
  };

  return (
    <div className="relative" data-testid="entity-card">
      <Card
        variant="entity"
        entityAccent={entityAccent}
        onClick={onClick}
        style={{ opacity: archived ? 0.6 : 1 }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-primary truncate">
            {(entity.name as string) || (entity.id as string)}
          </h3>
          <Badge variant={getBadgeVariant()}>{getStatusLabel()}</Badge>
        </div>

        {(renderBody || children) && (
          <div className="mt-3">
            {renderBody ? renderBody(entity) : children}
          </div>
        )}

        <div className="mt-3 text-xs text-text-secondary">
          Updated: {(entity.updated_at as string) || 'N/A'}
        </div>
      </Card>

      {contextItems.length > 0 && (
        <div className="absolute top-2 right-2 z-10">
          <ContextMenu items={contextItems} />
        </div>
      )}
    </div>
  );
}
