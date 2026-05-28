import { useState, useCallback } from 'react';

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
  detectDuplicate?: (data: Partial<T>, existingItems: T[]) => boolean;
}

export interface UseEntityManagerReturn<T> {
  items: T[];
  isLoading: boolean;
  error: Error | null;
  create: (data: Partial<T>) => Promise<T | undefined>;
  update: (id: string, data: Partial<T>) => Promise<T | undefined>;
  archive: (id: string) => Promise<T | undefined>;
  restore: (id: string) => Promise<T | undefined>;
  deletePermanently: (id: string) => Promise<void>;
  duplicate: (id: string) => Promise<T | undefined>;
  detectDuplicate: (data: Partial<T>) => boolean;
}

export function useEntityManager<T extends Record<string, unknown>>(
  config: UseEntityManagerConfig<T>
): UseEntityManagerReturn<T> {
  const { api, detectDuplicate: detectDuplicateFn } = config;

  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

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
        const error = err instanceof Error ? err : new Error('Create failed');
        setError(error);
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
        setItems((prev) => prev.map((item) => (String((item as any).id) === id ? updated : item)));
        return updated;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Update failed');
        setError(error);
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
        setItems((prev) => prev.map((item) => (String((item as any).id) === id ? archived : item)));
        return archived;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Archive failed');
        setError(error);
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
        setItems((prev) => prev.map((item) => (String((item as any).id) === id ? restored : item)));
        return restored;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Restore failed');
        setError(error);
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
        setItems((prev) => prev.filter((item) => String((item as any).id) !== id));
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Delete failed');
        setError(error);
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
        const error = err instanceof Error ? err : new Error('Duplicate failed');
        setError(error);
        return undefined;
      } finally {
        setIsLoading(false);
      }
    },
    [api.duplicate]
  );

  const checkDuplicate = useCallback(
    (data: Partial<T>): boolean => {
      if (!detectDuplicateFn) return false;
      return detectDuplicateFn(data, items);
    },
    [detectDuplicateFn, items]
  );

  return {
    items,
    isLoading,
    error,
    create,
    update,
    archive,
    restore,
    deletePermanently,
    duplicate: duplicateItem,
    detectDuplicate: checkDuplicate,
  };
}
