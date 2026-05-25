/**
 * Standard page layout for all entity management pages.
 *
 * Provides consistent structure: header, action bar, archived toggle,
 * loading/error states, and card list container.
 *
 * Entity-specific sections (e.g., combined balance card) are rendered
 * via the "extensions" slot between the header and the archived toggle.
 */

import React from "react";
import { PlusIcon } from "./icons";

export interface EntityPageProps {
  /** Page title. */
  title: string;

  /** Page subtitle/description. */
  subtitle?: string;

  /** Loading state. */
  loading: boolean;

  /** Error message, if any. */
  error: string | null;

  /** Whether to show archived entities. */
  includeArchived: boolean;

  /** Handler for archived toggle. */
  onToggleArchived: (checked: boolean) => void;

  /** Handler for create button click. */
  onCreateClick?: () => void;

  /** Label for the create button. */
  createButtonLabel?: string;

  /** Whether to show the create button (defaults to true). */
  showCreateButton?: boolean;

  /** Optional seed defaults button. */
  renderSeedButton?: () => React.ReactNode;

  /** Entity-specific extensions rendered between header and archived toggle. */
  children?: React.ReactNode;

  /** The entity list or tree content. */
  renderContent: () => React.ReactNode;

  /** Empty state message when no entities exist. */
  emptyMessage?: string;

  /** Whether the list is empty (for showing empty state). */
  isEmpty?: boolean;

  /** Additional CSS classes for the page container. */
  className?: string;
}

export function EntityPage({
  title,
  subtitle,
  loading,
  error,
  includeArchived,
  onToggleArchived,
  onCreateClick,
  createButtonLabel = "New",
  showCreateButton = true,
  renderSeedButton,
  children,
  renderContent,
  emptyMessage = "No items yet.",
  isEmpty = false,
  className = "",
}: EntityPageProps) {
  return (
    <div className={`min-h-screen bg-background text-text p-6 ${className}`}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-primary">{title}</h1>
            {subtitle && <p className="text-text-secondary text-sm mt-1">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-3">
            {renderSeedButton && renderSeedButton()}
            {showCreateButton && (
              <button
                onClick={onCreateClick}
                className="btn-primary flex items-center gap-2 px-4 py-2"
              >
                <PlusIcon />
                <span>{createButtonLabel}</span>
              </button>
            )}
          </div>
        </div>

        {/* Entity-specific extensions (e.g., combined balance card) */}
        {children}

        {/* Archived toggle */}
        <div className="flex items-center gap-3 mb-6">
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => onToggleArchived(e.target.checked)}
              className="rounded border-border bg-surface-elevated text-primary focus:ring-primary"
            />
            Show archived
          </label>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="text-center py-12 text-text-secondary">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            Loading...
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="bg-red-900/30 border border-red-500/50 text-red-400 rounded-lg px-4 py-3 mb-6">
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && isEmpty && (
          <div className="empty-state bg-surface/30 rounded-lg border border-border py-12 text-center">
            <p>{emptyMessage}</p>
          </div>
        )}

        {/* Entity list/tree content */}
        {!loading && !isEmpty && renderContent()}
      </div>
    </div>
  );
}
