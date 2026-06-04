import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Archive, Trash2, X } from 'lucide-react';

export interface BulkActionBarProps {
  selectedCount: number;
  /** Show Archive button only when provided */
  onArchive?: () => void;
  /** Show Delete button (danger style) only when provided */
  onDelete?: () => void;
  /** × button — clear selection */
  onClear: () => void;
  /** Disables all action buttons while a mutation is in flight */
  isLoading?: boolean;
}

export function BulkActionBar({
  selectedCount,
  onArchive,
  onDelete,
  onClear,
  isLoading = false,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className="animate-slide-in flex items-center justify-between gap-4
        bg-surface-overlay border border-border rounded-lg shadow-xl px-4 py-2 mt-3"
    >
      <span className="text-sm text-text-secondary">
        {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
      </span>

      <div className="flex items-center gap-2">
        {onArchive && (
          <Button variant="secondary" size="sm" onClick={onArchive} disabled={isLoading}>
            <Icon icon={Archive} size="sm" />
            Archive
          </Button>
        )}

        {onDelete && (
          <Button variant="danger" size="sm" onClick={onDelete} disabled={isLoading}>
            <Icon icon={Trash2} size="sm" />
            Delete
          </Button>
        )}

        <Button
          variant="icon"
          size="sm"
          onClick={onClear}
          disabled={isLoading}
          aria-label="Clear selection"
        >
          <Icon icon={X} size="sm" />
        </Button>
      </div>
    </div>
  );
}
