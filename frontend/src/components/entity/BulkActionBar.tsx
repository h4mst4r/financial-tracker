import React from 'react';
import { Button } from '../ui/Button';
import { Archive, Trash2, X } from 'lucide-react';

export interface BulkActionBarProps {
  selectedCount: number;
  onArchive: () => void;
  onDelete: () => void;
  onClearSelection: () => void;
}

export function BulkActionBar({
  selectedCount,
  onArchive,
  onDelete,
  onClearSelection,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-surface-200 border border-border-primary rounded-lg shadow-lg px-6 py-3 flex items-center gap-4">
      <span className="text-sm font-medium text-text-primary">
        {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
      </span>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onArchive}
          icon={Archive}
        >
          Archive
        </Button>

        <Button
          variant="destructive"
          size="sm"
          onClick={onDelete}
          icon={Trash2}
        >
          Delete
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          icon={X}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}
