import React, { useState, useCallback } from 'react';
import { Button } from '../ui/Button';
import { Toggle } from '../ui/Toggle';
import { Plus } from 'lucide-react';

export interface EntityPageProps<T extends Record<string, unknown>> {
  onCreateClick: () => void;
  showFilterBar?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
  title?: string;
}

export function EntityPage<T extends Record<string, unknown>>({
  onCreateClick,
  showFilterBar = false,
  actions,
  children,
  title,
}: EntityPageProps<T>) {
  const [showArchived, setShowArchived] = useState(false);

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {title && (
            <h1 className="text-2xl font-bold text-text-primary">{title}</h1>
          )}

          {/* Extension slot for entity-specific controls */}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>

        <div className="flex items-center gap-3">
          {/* Show Archived Toggle */}
          <Toggle
            checked={showArchived}
            onCheckedChange={setShowArchived}
            label="Show Archived"
          />

          {/* Primary Create Button */}
          <Button onClick={onCreateClick} icon={Plus}>
            Create
          </Button>
        </div>
      </div>

      {/* VisualizationFilterBar slot */}
      {showFilterBar && (
        <div className="bg-surface-200 rounded-lg p-4 border border-border-primary">
          <p className="text-sm text-text-secondary">
            Filter bar slot — pass VisualizationFilterBar as children or prop
          </p>
        </div>
      )}

      {/* Main content (list, grid, or table) */}
      <div>{children}</div>
    </div>
  );
}
