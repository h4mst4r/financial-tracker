/**
 * Merge confirmation dialog for combining duplicate categories.
 * Shows target category, source categories with transaction counts,
 * and a destructive-styled merge button with warnings.
 */
import { useState } from "react";
import { mergeCategories, type Category, type DuplicateGroup } from "../api/categories";

interface MergeDialogProps {
  selectedCategories: Category[];
  onClose: () => void;
  onSuccess: () => void;
}

// Feather icons
const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
);

const AlertIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
);

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
);

export function MergeDialog({ selectedCategories, onClose, onSuccess }: MergeDialogProps) {
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // First selected is the target (surviving category), rest are sources
  const target = selectedCategories[0];
  const sources = selectedCategories.slice(1);

  // Estimate total transactions (we don't have exact counts in the flat list)
  const totalItems = sources.length;

  const handleMerge = async () => {
    if (sources.length === 0) return;
    setMerging(true);
    setError(null);

    try {
      await mergeCategories(target.id, sources.map((s) => s.id));
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to merge categories");
      setMerging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="card max-w-lg w-full mx-4 animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-primary">Merge Categories</h2>
          <button onClick={onClose} className="btn-close">
            <XIcon />
          </button>
        </div>

        {/* Target category */}
        <div className="mb-4">
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2 block">
            Keep as primary
          </label>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-elevated border border-primary/30">
            <div
              className="w-4 h-4 rounded flex-shrink-0"
              style={{ backgroundColor: target.color || "#9E9E9E" }}
            />
            <span className="font-medium text-primary">{target.name}</span>
            {target.icon && <span>{target.icon}</span>}
          </div>
        </div>

        {/* Source categories */}
        <div className="mb-4">
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2 block">
            Merge into primary ({sources.length})
          </label>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {sources.map((source) => (
              <div
                key={source.id}
                className="flex items-center gap-3 p-2.5 rounded-lg bg-surface/50 border border-border"
              >
                <div
                  className="w-3 h-3 rounded flex-shrink-0 opacity-70"
                  style={{ backgroundColor: source.color || "#9E9E9E" }}
                />
                <span className="text-text-secondary line-through">{source.name}</span>
                {source.icon && <span className="opacity-60">{source.icon}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Warning banner */}
        {totalItems >= 2 && (
          <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm">
            <span className="flex-shrink-0 mt-0.5"><AlertIcon /></span>
            <span>
              This will merge {totalItems} categories into "{target.name}".
              All transactions and subcategories will be reassigned. Source categories will be archived.
            </span>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="alert-error text-sm py-2.5 mb-4">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={merging}
            className="btn-cancel px-4 py-2"
          >
            Cancel
          </button>
          <button
            onClick={handleMerge}
            disabled={merging || sources.length === 0}
            className="btn-danger flex items-center gap-2 px-4 py-2 disabled:opacity-50"
          >
            {merging ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-background" />
                <span>Merging...</span>
              </>
            ) : (
              <>
                <CheckIcon />
                <span>Merge {totalItems} Categories</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
