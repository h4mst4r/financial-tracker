/**
 * Generic entity card component with hover-reveal action buttons.
 *
 * Used by all entity management pages for consistent card display.
 * Entity-specific content (balance, progress bar, etc.) is rendered via children.
 */

import React from "react";
import { BaseEntity } from "../../hooks/useEntityManager";
import { EditIcon, ArchiveIcon, RestoreIcon, DeletePermanentlyIcon } from "./icons";

export interface EntityCardProps<T extends BaseEntity> {
  /** The entity to display. */
  entity: T;

  /** Render the left section (icon + name + subtitle). */
  renderLeft: (entity: T) => React.ReactNode;

  /** Optional render for the right section (primary value, e.g., balance). */
  renderRight?: (entity: T) => React.ReactNode;

  /** Optional additional content rendered below the main row. */
  children?: React.ReactNode;

  /** Callback when edit is clicked. */
  onEdit?: (entity: T) => void;

  /** Callback when archive/restore is clicked. */
  onArchive?: (entity: T) => void;
  onRestore?: (entity: T) => void;

  /** Callback when permanent delete is clicked. */
  onDeletePermanently?: (entity: T) => void;

  /** Whether to show action buttons (defaults to true on hover). */
  showActions?: boolean;

  /** Additional CSS classes for the card container. */
  className?: string;
}

export function EntityCard<T extends BaseEntity>({
  entity,
  renderLeft,
  renderRight,
  children,
  onEdit,
  onArchive,
  onRestore,
  onDeletePermanently,
  showActions = true,
  className = "",
}: EntityCardProps<T>) {
  const isActive = entity.is_active;

  return (
    <div
      className={`flex flex-col bg-surface border border-border rounded-xl px-4 py-3.5 hover:border-border transition-colors group ${className}`}
    >
      {/* Main row */}
      <div className="flex items-center justify-between">
        {/* Left section */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {renderLeft(entity)}
        </div>

        {/* Right section + actions */}
        <div className="flex items-center gap-4">
          {renderRight && renderRight(entity)}

          {/* Hover-reveal action buttons */}
          {showActions && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {isActive ? (
                <>
                  {onEdit && (
                    <button
                      onClick={() => onEdit(entity)}
                      className="p-1.5 text-text-secondary hover:text-primary rounded transition-colors"
                      title="Edit"
                    >
                      <EditIcon />
                    </button>
                  )}
                  {onArchive && (
                    <button
                      onClick={() => onArchive(entity)}
                      className="p-1.5 text-text-secondary hover:text-yellow-400 rounded transition-colors"
                      title="Archive"
                    >
                      <ArchiveIcon />
                    </button>
                  )}
                </>
              ) : (
                <>
                  {onRestore && (
                    <button
                      onClick={() => onRestore(entity)}
                      className="p-1.5 text-text-secondary hover:text-green-400 rounded transition-colors"
                      title="Restore"
                    >
                      <RestoreIcon />
                    </button>
                  )}
                  {onDeletePermanently && (
                    <button
                      onClick={() => onDeletePermanently(entity)}
                      className="p-1.5 text-text-secondary hover:text-error rounded transition-colors"
                      title="Delete Permanently"
                    >
                      <DeletePermanentlyIcon />
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Extension slot for entity-specific content */}
      {children && <div className="mt-2 pt-2 border-t border-border">{children}</div>}
    </div>
  );
}
