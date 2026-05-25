import { useState, useCallback, useEffect } from "react";
import {
  previewImportMapping,
  saveImportMapping,
  type ImportedCategory,
  type ImportPreviewResponse,
  type MappingOverride,
  type ImportMappingResponse,
} from "../api/categories";

// --- Types ---

export interface ExistingCategory {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  parent_id: string | null;
}

interface ImportCategoryMappingProps {
  /** Raw category names extracted from the imported data (e.g. CSV column values) */
  rawCategoryNames: string[];
  /** Existing categories available for mapping */
  existingCategories: ExistingCategory[];
  /** Callback when mapping is complete with results */
  onComplete?: (result: ImportMappingResponse) => void;
  /** Callback to signal the component should be closed/dismissed */
  onCancel?: () => void;
}

// --- Icons ---

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
);

const AlertIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
);

const LinkIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
);

const UnlinkIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.71 1.71"></path><path d="M5 12a5 5 0 0 1 7.54-.54l3-3"></path><path d="M8.25 18.84l-1.71 1.71a5 5 0 0 1-7.07-7.07l1.71-1.71"></path><line x1="2" y1="2" x2="22" y2="22"></line></svg>
);

// --- Match type styling ---

const MATCH_BADGE_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  exact: { bg: "rgba(76, 175, 80, 0.15)", text: "#4CAF50", border: "rgba(76, 175, 80, 0.3)", label: "Exact" },
  trimmed: { bg: "rgba(33, 150, 243, 0.15)", text: "#2196F3", border: "rgba(33, 150, 243, 0.3)", label: "Trimmed" },
  fuzzy: { bg: "rgba(255, 193, 7, 0.15)", text: "#FFC107", border: "rgba(255, 193, 7, 0.3)", label: "Fuzzy" },
  unmapped: { bg: "rgba(244, 67, 54, 0.15)", text: "#F44336", border: "rgba(244, 67, 54, 0.3)", label: "Unmapped" },
};

/**
 * ImportCategoryMapping Component
 * 
 * Shows a mapping table that matches imported category names to existing categories.
 * Supports exact, trimmed, fuzzy matching and manual overrides.
 */
export const ImportCategoryMapping: React.FC<ImportCategoryMappingProps> = ({
  rawCategoryNames,
  existingCategories,
  onComplete,
  onCancel,
}) => {
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Track user's manual mapping overrides
  const [mappingOverrides, setMappingOverrides] = useState<Record<string, MappingOverride>>({});

  // Fetch preview mappings on mount
  useEffect(() => {
    loadPreview();
  }, []);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await previewImportMapping(rawCategoryNames);
      setPreview(result);
      
      // Initialize overrides for unmapped categories (auto-create by default)
      const initialOverrides: Record<string, MappingOverride> = {};
      for (const mapping of result.mappings) {
        if (mapping.needs_mapping) {
          initialOverrides[mapping.imported_name] = {
            imported_name: mapping.imported_name,
            mapped_to_id: null,
            create_new: true, // Default to auto-create
          };
        }
      }
      setMappingOverrides(initialOverrides);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load category mappings");
    } finally {
      setLoading(false);
    }
  }, [rawCategoryNames]);

  // Handle dropdown change for a specific imported category
  const handleMappingChange = useCallback((importedName: string, targetId: string | null) => {
    setMappingOverrides(prev => {
      const existing = prev[importedName] ?? {
        imported_name: importedName,
        mapped_to_id: null,
        create_new: true,
      };
      return {
        ...prev,
        [importedName]: {
          ...existing,
          mapped_to_id: targetId,
          // If user selects a category, disable auto-create
          create_new: targetId ? false : existing.create_new,
        },
      };
    });
  }, []);

  // Handle "Create New" checkbox toggle
  const handleAutoCreateToggle = useCallback((importedName: string, enabled: boolean) => {
    setMappingOverrides(prev => {
      const existing = prev[importedName] ?? {
        imported_name: importedName,
        mapped_to_id: null,
        create_new: true,
      };
      return {
        ...prev,
        [importedName]: {
          ...existing,
          create_new: enabled,
          // If enabling auto-create, clear the manual mapping
          mapped_to_id: enabled ? null : existing.mapped_to_id,
        },
      };
    });
  }, []);

  // Bulk action: map all unmapped to "Other" category
  const handleMapAllToOther = useCallback(() => {
    const otherCategory = existingCategories.find(
      cat => cat.name.toLowerCase() === "other"
    );
    if (!otherCategory) {
      alert("No 'Other' category found. Please create it first.");
      return;
    }

    setMappingOverrides(prev => {
      const updated = { ...prev };
      for (const mapping of preview?.mappings ?? []) {
        if (mapping.needs_mapping) {
          updated[mapping.imported_name] = {
            imported_name: mapping.imported_name,
            mapped_to_id: otherCategory.id,
            create_new: false,
          };
        }
      }
      return updated;
    });
  }, [preview, existingCategories]);

  // Save all mappings and auto-create categories
  const handleSaveMappings = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const overrides = Object.values(mappingOverrides);
      const result = await saveImportMapping(overrides);
      onComplete?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save mappings");
    } finally {
      setSaving(false);
    }
  }, [mappingOverrides, onComplete]);

  // Get the effective mapping for a row (preview + user override)
  const getEffectiveMapping = (imp: ImportedCategory): { targetId: string | null; createNew: boolean } => {
    const override = mappingOverrides[imp.imported_name];
    if (override) {
      return { targetId: override.mapped_to_id, createNew: override.create_new };
    }
    // Use preview's auto-match
    return { targetId: imp.matched_category_id, createNew: false };
  };

  // --- Render ---

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-400">Analyzing category mappings...</div>
      </div>
    );
  }

  if (error && !preview) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6">
        <div className="flex items-center gap-2 text-red-400 mb-2">
          <AlertIcon />
          <span className="font-medium">Failed to Load Mappings</span>
        </div>
        <p className="text-sm text-slate-300">{error}</p>
        <button
          onClick={loadPreview}
          className="mt-4 px-4 py-2 text-sm bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-md transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="import-category-mapping space-y-4">
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Map Categories</h3>
          <p className="text-sm text-slate-400">
            {preview?.total_categories ?? 0} unique categories found · 
            {preview?.exact_matches ?? 0} matched · 
            {preview?.fuzzy_matches ?? 0} fuzzy · 
            {preview?.unmapped_count ?? 0} unmapped
          </p>
        </div>
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertIcon />
            {error}
          </div>
        )}
      </div>

      {/* Mapping Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800/50">
              <th className="text-left px-4 py-3 font-medium text-slate-300">Imported Category</th>
              <th className="text-center px-4 py-3 font-medium text-slate-300 w-20">Count</th>
              <th className="text-left px-4 py-3 font-medium text-slate-300">Mapped To</th>
              <th className="text-center px-4 py-3 font-medium text-slate-300 w-28">Status</th>
              <th className="text-center px-4 py-3 font-medium text-slate-300 w-32">Action</th>
            </tr>
          </thead>
          <tbody>
            {preview?.mappings.map((imp) => {
              const badge = MATCH_BADGE_STYLES[imp.match_type] ?? MATCH_BADGE_STYLES.unmapped;
              const effective = getEffectiveMapping(imp);
              
              return (
                <tr key={imp.imported_name} className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
                  {/* Imported name */}
                  <td className="px-4 py-3">
                    <span className="font-medium text-white">{imp.imported_name}</span>
                  </td>

                  {/* Transaction count */}
                  <td className="px-4 py-3 text-center text-slate-300">
                    {imp.transaction_count}
                  </td>

                  {/* Mapped to dropdown */}
                  <td className="px-4 py-3">
                    <select
                      value={effective.targetId ?? ""}
                      onChange={(e) => handleMappingChange(imp.imported_name, e.target.value || null)}
                      className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                    >
                      <option value="">— Uncategorized —</option>
                      {existingCategories.map(cat => (
                        <option key={cat.id} value={cat.id}>
                          {cat.icon ? `${cat.icon} ` : ""}{cat.name}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Match type badge */}
                  <td className="px-4 py-3 text-center">
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ backgroundColor: badge.bg, color: badge.text, borderColor: badge.border }}
                    >
                      {imp.match_type === "exact" && <CheckIcon />}
                      {imp.match_type === "trimmed" && <LinkIcon />}
                      {imp.match_type === "fuzzy" && <AlertIcon />}
                      {imp.match_type === "unmapped" && <UnlinkIcon />}
                      {badge.label}
                    </span>
                  </td>

                  {/* Action (create new checkbox for unmapped) */}
                  <td className="px-4 py-3 text-center">
                    {imp.needs_mapping && (
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={effective.createNew}
                          onChange={(e) => handleAutoCreateToggle(imp.imported_name, e.target.checked)}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-500/50 focus:ring-2"
                        />
                        <span className="text-xs text-slate-300">Create New</span>
                      </label>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bulk actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleMapAllToOther}
          disabled={!preview || preview.unmapped_count === 0}
          className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 rounded-md transition-colors"
        >
          Map All Unmapped to "Other"
        </button>

        <div className="flex items-center gap-3">
          {onCancel && (
            <button
              onClick={onCancel}
              disabled={saving}
              className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-md transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleSaveMappings}
            disabled={saving || Object.keys(mappingOverrides).length === 0}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md transition-colors flex items-center gap-2"
          >
            <CheckIcon />
            {saving ? "Saving..." : "Save Mappings"}
          </button>
        </div>
      </div>
    </div>
  );
};
