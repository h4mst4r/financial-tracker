/**
 * CategoryManager — Full category management UI.
 *
 * Uses shared abstractions:
 * - useEntityManager<Category> for CRUD + lifecycle
 * - EmojiPicker for icon selection
 * - ColorPicker for color selection
 * - Icons from shared/icons.tsx
 *
 * Category-specific extensions:
 * - Tree view with drag-and-drop hierarchy management
 * - Multi-select + merge duplicates
 * - Subcategory support (parent_id)
 * - Default category seeding
 */
import { useState, useEffect, useRef } from "react";
import {
  fetchCategories,
  createCategory,
  updateCategory,
  archiveCategory,
  restoreCategory,
  deleteCategoryPermanently,
  createDefaultCategories,
  fetchCategoryTree,
  mergeCategories,
  type Category,
  type CategoryCreateData,
  type CategoryUpdateData,
  type CategoryTreeNode,
} from "../api/categories";
import { useEntityManager } from "../hooks/useEntityManager";
import { EmojiPicker, EmojiIcon } from "./shared/EmojiPicker";
import { ColorPicker } from "./shared/ColorPicker";
import { PlusIcon, XIcon, CheckIcon } from "./shared/icons";
import { CategoryTree } from "./CategoryTree";
import { MergeDialog } from "./MergeDialog";

interface CategoryManagerProps {
  onCategoryChange?: () => void;
}

export default function CategoryManager({ onCategoryChange }: CategoryManagerProps) {
  // --- EntityManager for CRUD + lifecycle ---
  const em = useEntityManager<Category>({
    loadAll: (includeArchived) => fetchCategories({ include_archived: includeArchived }),
    create: (data) => createCategory(data as CategoryCreateData),
    update: (id, data) => updateCategory(id, data as CategoryUpdateData),
    archive: (id) => archiveCategory(id),
    restore: (id) => restoreCategory(id),
    deletePermanently: (id) => deleteCategoryPermanently(id),
    onArchiveConfirm: (cat) => `Are you sure you want to archive "${cat.name}"?`,
    onDeleteConfirm: (cat) => `Are you sure you want to permanently delete "${cat.name}"? This cannot be undone.`,
    onLoadComplete: () => loadCategoryTree(),
  });

  const {
    entities: categories,
    loading,
    error,
    includeArchived: showArchived,
    setIncludeArchived: setShowArchived,
    refresh,
    showForm,
    showCreateForm,
    resetForm,
    editingId,
    startEdit,
    handleCreate,
    handleUpdate,
    handleArchive,
    handleRestore,
    handleDeletePermanently,
    submitting,
    formError,
    clearFormError,
    seeding,
    handleSeedDefaults,
  } = em;

  // --- Category-specific state ---
  const [categoryTree, setCategoryTree] = useState<CategoryTreeNode[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const formRef = useRef<HTMLDivElement>(null);

  // Form fields (category-specific: color, icon, parent_id)
  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState("#9E9E9E");
  const [formIcon, setFormIcon] = useState("");
  const [formParentId, setFormParentId] = useState<string | null>(null);

  // Multi-select & merge state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeToast, setMergeToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // --- Category tree loading ---
  const loadCategoryTree = async () => {
    try {
      const tree = await fetchCategoryTree(showArchived);
      setCategoryTree(tree);
      if (expandedIds.size === 0) {
        setExpandedIds(new Set(tree.map((n) => n.id)));
      }
    } catch (err) {
      console.error("Failed to load category tree:", err);
    }
  };

  // Notify parent on category change
  useEffect(() => {
    onCategoryChange?.();
  }, [categories, onCategoryChange]);

  // Scroll form into view when it opens
  useEffect(() => {
    if (showForm && formRef.current) {
      formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [showForm]);

  // Sync form state when editingId changes
  useEffect(() => {
    if (editingId) {
      const cat = categories.find((c) => c.id === editingId);
      if (cat) {
        setFormName(cat.name);
        setFormColor(cat.color || "#9E9E9E");
        setFormIcon(cat.icon || "");
        setFormParentId(cat.parent_id || null);
      }
    } else {
      // Reset for create mode
      setFormName("");
      setFormColor("#9E9E9E");
      setFormIcon("");
      setFormParentId(null);
    }
  }, [editingId, categories]);

  // Override resetForm to also clear category-specific fields
  const handleResetForm = () => {
    resetForm();
    setFormName("");
    setFormColor("#9E9E9E");
    setFormIcon("");
    setFormParentId(null);
    clearFormError();
  };

  // --- Form submission handlers ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      await handleUpdate(editingId, {
        name: formName,
        color: formColor,
        icon: formIcon || null,
        parent_id: formParentId,
      });
    } else {
      const payload: CategoryCreateData = {
        name: formName,
        color: formColor,
      };
      if (formIcon) payload.icon = formIcon;
      if (formParentId) payload.parent_id = formParentId;
      await handleCreate(payload);
    }
  };

  // --- Tree handlers ---
  const handleToggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAddSubcategory = (parentId: string) => {
    handleResetForm();
    setFormParentId(parentId);
    showCreateForm();
  };

  const handleReparent = async (categoryId: string, newParentId: string | null) => {
    try {
      await updateCategory(categoryId, { parent_id: newParentId });
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to move category");
    }
  };

  // --- Multi-select handlers ---
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === categories.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(categories.map((c) => c.id)));
    }
  };

  // --- Merge handlers ---
  const handleOpenMergeDialog = () => setShowMergeDialog(true);
  const handleCloseMergeDialog = () => setShowMergeDialog(false);

  const handleMergeSuccess = async (mergedSourceIds?: string[]) => {
    setShowMergeDialog(false);
    setSelectedIds(new Set());
    await refresh();
    const count = mergedSourceIds?.length || 2;
    setMergeToast({ message: `Merged ${count} categories`, type: "success" });
  };

  // Auto-dismiss toast
  useEffect(() => {
    if (mergeToast) {
      const timer = setTimeout(() => setMergeToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [mergeToast]);

  // --- Seed defaults ---
  const handleCreateDefaults = async () => {
    await handleSeedDefaults(
      () => createDefaultCategories(),
      "This will create all default categories (17 total). Categories that already exist by name will be skipped. Continue?"
    );
  };

  // --- Derived data ---
  const topLevelCategories = categories.filter((c) => !c.parent_id);

  return (
    <div className="min-h-screen bg-background text-text p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-primary">Categories</h1>
            <p className="text-text-secondary text-sm mt-1">Manage your transaction categories</p>
          </div>
          <div className="flex items-center gap-3">
            {selectedIds.size >= 2 && (
              <button onClick={handleOpenMergeDialog} className="btn-merge flex items-center gap-2 px-4 py-2">
                <span>Merge ({selectedIds.size})</span>
              </button>
            )}
            <button
              onClick={handleCreateDefaults}
              disabled={seeding}
              className="btn-secondary flex items-center gap-2 px-4 py-2 disabled:opacity-50"
            >
              <PlusIcon />
              <span>{seeding ? "Creating..." : "Defaults"}</span>
            </button>
            <button onClick={() => { handleResetForm(); showCreateForm(); }} className="btn-primary flex items-center gap-2 px-4 py-2">
              <PlusIcon />
              <span>New Category</span>
            </button>
          </div>
        </div>

        {/* Selection toolbar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-purple-600/10 border border-purple-500/30">
            <span className="text-sm text-text-secondary">
              {selectedIds.size} categor{selectedIds.size === 1 ? "y" : "ies"} selected
            </span>
            <button onClick={() => setSelectedIds(new Set())} className="text-xs text-text-secondary hover:text-primary underline">
              Clear selection
            </button>
          </div>
        )}

        {/* Archived toggle */}
        <div className="flex items-center gap-3 mb-6">
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded border-border bg-surface text-primary focus:ring-primary"
            />
            Show archived categories
          </label>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="text-center py-12 text-text-secondary">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            Loading categories...
          </div>
        )}

        {/* Error state */}
        {error && <div className="alert-error mb-6">{error}</div>}

        {/* Create/Edit Form */}
        {showForm && (
          <div ref={formRef} className="card mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-primary">{editingId ? "Edit Category" : "Create New Category"}</h2>
              <button onClick={handleResetForm} className="btn-close">
                <XIcon />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div>
                <label className="label mb-2">Category Name *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Entertainment"
                  required
                  className="input"
                />
              </div>

              {/* Color — shared component */}
              <div>
                <label className="label mb-2">Color</label>
                <ColorPicker value={formColor} onChange={setFormColor} />
              </div>

              {/* Icon — shared component */}
              <div>
                <label className="label mb-2">Icon (optional)</label>
                <EmojiPicker value={formIcon} onChange={setFormIcon} />
              </div>

              {/* Parent category */}
              <div>
                <label className="label mb-2">Parent Category (optional)</label>
                <select
                  value={formParentId || ""}
                  onChange={(e) => setFormParentId(e.target.value || null)}
                  className="select"
                >
                  <option value="">None (top-level category)</option>
                  {topLevelCategories
                    .filter((c) => !editingId || c.id !== editingId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>

              {/* Error message */}
              {formError && <div className="alert-error text-sm py-2.5">{formError}</div>}

              {/* Submit buttons */}
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting} className="btn-primary flex items-center gap-2 px-4 py-2">
                  {submitting ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-background"></div>
                  ) : (
                    <CheckIcon />
                  )}
                  <span>{editingId ? "Save Changes" : "Create Category"}</span>
                </button>
                <button type="button" onClick={handleResetForm} className="btn-cancel px-4 py-2">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Category Tree */}
        {!loading && (
          <div className="space-y-4">
            {categoryTree.length === 0 ? (
              <div className="empty-state bg-surface/30 rounded-lg border border-border">
                <p>No categories yet. Create your first category to get started.</p>
              </div>
            ) : (
              <CategoryTree
                nodes={categoryTree}
                expandedIds={expandedIds}
                onToggleExpand={handleToggleExpand}
                onEdit={(node) => {
                  const flat = categories.find((c) => c.id === node.id);
                  if (flat) startEdit(flat);
                }}
                onArchive={handleArchive}
                onRestore={handleRestore}
                onDeletePermanently={handleDeletePermanently}
                onAddSubcategory={handleAddSubcategory}
                onReparent={handleReparent}
                showActions={true}
                allCategories={categories.map((c) => ({ id: c.id, parent_id: c.parent_id }))}
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
              />
            )}
          </div>
        )}

        {/* Merge Dialog */}
        {showMergeDialog && selectedIds.size >= 2 && (
          <MergeDialog
            selectedCategories={categories.filter((c) => selectedIds.has(c.id))}
            onClose={handleCloseMergeDialog}
            onSuccess={handleMergeSuccess}
          />
        )}

        {/* Merge Toast */}
        {mergeToast && (
          <div
            className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg z-50 ${
              mergeToast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
            }`}
          >
            {mergeToast.message}
          </div>
        )}
      </div>
    </div>
  );
}
