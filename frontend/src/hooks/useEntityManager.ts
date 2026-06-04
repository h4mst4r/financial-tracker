import { useState, useCallback, useEffect } from 'react';

export interface EntityApi<T> {
  getAll?: (showArchived?: boolean) => Promise<T[]>;
  create?: (data: Partial<T>) => Promise<T>;
  update?: (id: string, data: Partial<T>) => Promise<T>;
  archive?: (id: string) => Promise<T>;
  restore?: (id: string) => Promise<T>;
  deletePermanently?: (id: string) => Promise<void>;
  duplicate?: (id: string) => Promise<T>;
}

export interface UseEntityManagerConfig<T> {
  api: EntityApi<T>;
  // Returns the duplicate entity if found, null otherwise (EDP §14.2) [G-08]
  detectDuplicate?: (data: Partial<T>, existingItems: T[]) => T | null;
}

export interface UseEntityManagerReturn<T> {
  items: T[];
  isLoading: boolean;
  error: Error | null;
  showArchived: boolean;
  setShowArchived: (value: boolean) => void;
  reload: () => Promise<void>;
  create: (data: Partial<T>) => Promise<T | undefined>;
  update: (id: string, data: Partial<T>) => Promise<T | undefined>;
  archive: (id: string) => Promise<T | undefined>;
  restore: (id: string) => Promise<T | undefined>;
  deletePermanently: (id: string) => Promise<void>;
  duplicate: (id: string) => Promise<T | undefined>;
  // Returns the duplicate entity or null [G-08]
  detectDuplicate: (data: Partial<T>) => T | null;
}

export function useEntityManager<T extends Record<string, unknown>>(
  config: UseEntityManagerConfig<T>
): UseEntityManagerReturn<T> {
  const { api, detectDuplicate: detectDuplicateFn } = config;

  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Initial load and reload on showArchived change [G-11]
  const reload = useCallback(async () => {
    if (!api.getAll) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getAll(showArchived);
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load items'));
    } finally {
      setIsLoading(false);
    }
  }, [api.getAll, showArchived]);

  useEffect(() => {
    reload();
  }, [reload]);

  const create = useCallback(
    async (data: Partial<T>): Promise<T | undefined> => {
      if (!api.create) return undefined;
      setIsLoading(true);
      setError(null);
      try {
        const newItem = await api.create(data);
        setItems((prev) => [...prev, newItem]);
        return newItem;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Create failed'));
        return undefined;
      } finally {
        setIsLoading(false);
      }
    },
    [api.create]
  );

  const update = useCallback(
    async (id: string, data: Partial<T>): Promise<T | undefined> => {
      if (!api.update) return undefined;
      setIsLoading(true);
      setError(null);
      try {
        const updated = await api.update(id, data);
        setItems((prev) => prev.map((item) => (String(item.id) === id ? updated : item)));
        return updated;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Update failed'));
        return undefined;
      } finally {
        setIsLoading(false);
      }
    },
    [api.update]
  );

  const archive = useCallback(
    async (id: string): Promise<T | undefined> => {
      if (!api.archive) return undefined;
      setIsLoading(true);
      setError(null);
      try {
        const archived = await api.archive(id);
        setItems((prev) => prev.map((item) => (String(item.id) === id ? archived : item)));
        return archived;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Archive failed'));
        return undefined;
      } finally {
        setIsLoading(false);
      }
    },
    [api.archive]
  );

  const restore = useCallback(
    async (id: string): Promise<T | undefined> => {
      if (!api.restore) return undefined;
      setIsLoading(true);
      setError(null);
      try {
        const restored = await api.restore(id);
        setItems((prev) => prev.map((item) => (String(item.id) === id ? restored : item)));
        return restored;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Restore failed'));
        return undefined;
      } finally {
        setIsLoading(false);
      }
    },
    [api.restore]
  );

  const deletePermanently = useCallback(
    async (id: string): Promise<void> => {
      if (!api.deletePermanently) return;
      setIsLoading(true);
      setError(null);
      try {
        await api.deletePermanently(id);
        setItems((prev) => prev.filter((item) => String(item.id) !== id));
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Delete failed'));
      } finally {
        setIsLoading(false);
      }
    },
    [api.deletePermanently]
  );

  const duplicateItem = useCallback(
    async (id: string): Promise<T | undefined> => {
      if (!api.duplicate) return undefined;
      setIsLoading(true);
      setError(null);
      try {
        const newItem = await api.duplicate(id);
        setItems((prev) => [...prev, newItem]);
        return newItem;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Duplicate failed'));
        return undefined;
      } finally {
        setIsLoading(false);
      }
    },
    [api.duplicate]
  );

  // Returns the duplicate entity or null [G-08]
  const checkDuplicate = useCallback(
    (data: Partial<T>): T | null => {
      if (!detectDuplicateFn) return null;
      return detectDuplicateFn(data, items);
    },
    [detectDuplicateFn, items]
  );

  return {
    items,
    isLoading,
    error,
    showArchived,
    setShowArchived,
    reload,
    create,
    update,
    archive,
    restore,
    deletePermanently,
    duplicate: duplicateItem,
    detectDuplicate: checkDuplicate,
  };
}
