/**
 * Generic entity management hook for CRUD + lifecycle operations.
 *
 * Handles all common patterns shared across entity management pages:
 * - Entity list with loading/error states
 * - Include archived toggle with auto-refresh
 * - Form state management (showForm, editingId, resetForm)
 * - CRUD operations with auto-refresh on success
 * - Archive/restore/permanent delete with confirmation dialogs
 * - Seed defaults operation
 *
 * Usage:
 *   const { entities, loading, error, create, archive, ... } = useEntityManager<Account>({
 *     loadAll: (includeArchived) => listAccounts(includeArchived),
 *     create: (data) => createAccount(data),
 *     update: (id, data) => updateAccount(id, data),
 *     archive: (id) => archiveAccount(id),
 *     restore: (id) => restoreAccount(id),
 *     deletePermanently: (id) => deleteAccountPermanently(id),
 *     onArchiveConfirm: (entity) => `Archive "${entity.name}"?`,
 *     onDeleteConfirm: (entity) => `Permanently delete "${entity.name}"? This cannot be undone.`,
 *   });
 */

import { useState, useCallback, useEffect } from "react";

// --- Types ---

export interface BaseEntity {
  id: string;
  is_active: boolean;
}

export interface EntityManagerConfig<T extends BaseEntity> {
  /** Load all entities, optionally including archived ones. */
  loadAll: (includeArchived?: boolean) => Promise<T[]>;

  /** Create a new entity. */
  create: (data: any) => Promise<void>;

  /** Update an existing entity. */
  update: (id: string, data: any) => Promise<void>;

  /** Soft-delete (archive) an entity. */
  archive: (id: string) => Promise<void>;

  /** Restore a previously archived entity. */
  restore: (id: string) => Promise<void>;

  /** Permanently delete an entity (optional). */
  deletePermanently?: (id: string) => Promise<void>;

  /** Confirmation message for archive action. Return null/undefined to skip confirmation. */
  onArchiveConfirm?: (entity: T) => string | null;

  /** Confirmation message for permanent delete. Return null/undefined to skip confirmation. */
  onDeleteConfirm?: (entity: T) => string | null;

  /** Callback after entities are loaded (optional, for side effects like tree loading). */
  onLoadComplete?: () => Promise<void> | void;
}

export interface EntityManagerState<T extends BaseEntity> {
  /** Current entity list. */
  entities: T[];

  /** Loading state. */
  loading: boolean;

  /** Error message, if any. */
  error: string | null;

  /** Whether to include archived entities. */
  includeArchived: boolean;

  /** Set includeArchived flag (triggers auto-refresh). */
  setIncludeArchived: (value: boolean) => void;

  /** Force refresh entities. */
  refresh: () => Promise<void>;

  // --- Form state ---

  /** Whether the create/edit form is visible. */
  showForm: boolean;

  /** Show the create form. */
  showCreateForm: () => void;

  /** Hide and reset the form. */
  resetForm: () => void;

  /** ID of the entity being edited, or null for create mode. */
  editingId: string | null;

  /** Start editing an existing entity. */
  startEdit: (entity: T) => void;

  // --- CRUD operations ---

  /** Create a new entity and refresh. */
  handleCreate: (data: any) => Promise<void>;

  /** Update an existing entity and refresh. */
  handleUpdate: (id: string, data: any) => Promise<void>;

  /** Archive an entity with optional confirmation. */
  handleArchive: (entity: T) => Promise<void>;

  /** Restore an archived entity. */
  handleRestore: (entity: T) => Promise<void>;

  /** Permanently delete an entity with optional confirmation. */
  handleDeletePermanently: (entity: T) => Promise<void>;

  /** Whether a CRUD operation is in progress. */
  submitting: boolean;

  /** Form error message, if any. */
  formError: string | null;

  /** Clear form error. */
  clearFormError: () => void;

  // --- Seed defaults ---

  /** Whether seeding is in progress. */
  seeding: boolean;

  /** Seed default entities with confirmation. */
  handleSeedDefaults: (seedFn: () => Promise<void>, confirmMessage: string) => Promise<void>;
}

export function useEntityManager<T extends BaseEntity>(
  config: EntityManagerConfig<T>
): EntityManagerState<T> {
  // --- Entity list state ---
  const [entities, setEntities] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);

  // --- Form state ---
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // --- Seed state ---
  const [seeding, setSeeding] = useState(false);

  // --- Load entities ---
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await config.loadAll(includeArchived);
      setEntities(data);
      await config.onLoadComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load entities");
    } finally {
      setLoading(false);
    }
  }, [config, includeArchived]);

  // Load on mount and when includeArchived changes
  useEffect(() => {
    refresh();
  }, [refresh]);

  // --- Form helpers ---
  const resetForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setFormError(null);
  }, []);

  const showCreateForm = useCallback(() => {
    setEditingId(null);
    setFormError(null);
    setShowForm(true);
  }, []);

  const startEdit = useCallback((entity: T) => {
    setEditingId(entity.id);
    setFormError(null);
    setShowForm(true);
  }, []);

  const clearFormError = useCallback(() => {
    setFormError(null);
  }, []);

  // --- CRUD operations ---
  const handleCreate = useCallback(async (data: any) => {
    setSubmitting(true);
    setFormError(null);
    try {
      await config.create(data);
      resetForm();
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create entity");
    } finally {
      setSubmitting(false);
    }
  }, [config, resetForm, refresh]);

  const handleUpdate = useCallback(async (id: string, data: any) => {
    setSubmitting(true);
    setFormError(null);
    try {
      await config.update(id, data);
      resetForm();
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to update entity");
    } finally {
      setSubmitting(false);
    }
  }, [config, resetForm, refresh]);

  const handleArchive = useCallback(async (entity: T) => {
    const message = config.onArchiveConfirm?.(entity);
    if (message && !confirm(message)) return;

    try {
      await config.archive(entity.id);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to archive entity");
    }
  }, [config, refresh]);

  const handleRestore = useCallback(async (entity: T) => {
    try {
      await config.restore(entity.id);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to restore entity");
    }
  }, [config, refresh]);

  const handleDeletePermanently = useCallback(async (entity: T) => {
    if (!config.deletePermanently) {
      console.warn("deletePermanently not configured for this entity type");
      return;
    }

    const message = config.onDeleteConfirm?.(entity);
    if (message && !confirm(message)) return;

    try {
      await config.deletePermanently(entity.id);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete entity permanently");
    }
  }, [config, refresh]);

  // --- Seed defaults ---
  const handleSeedDefaults = useCallback(async (seedFn: () => Promise<void>, confirmMessage: string) => {
    if (!confirm(confirmMessage)) return;
    setSeeding(true);
    try {
      await seedFn();
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to seed defaults");
    } finally {
      setSeeding(false);
    }
  }, [refresh]);

  return {
    entities,
    loading,
    error,
    includeArchived,
    setIncludeArchived,
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
  };
}
