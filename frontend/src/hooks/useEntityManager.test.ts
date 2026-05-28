import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEntityManager } from './useEntityManager';

interface TestEntity {
  id: string;
  name: string;
  status: string;
  archived: boolean;
}

const mockApi = {
  getAll: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  restore: vi.fn(),
  deletePermanently: vi.fn(),
  duplicate: vi.fn(),
};

describe('useEntityManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should initialize with empty items, no loading, no error', () => {
      const { result } = renderHook(() =>
        useEntityManager<TestEntity>({ api: mockApi })
      );

      expect(result.current.items).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(null);
    });
  });

  describe('create', () => {
    it('should create a new item and add it to items array', async () => {
      const newEntity: TestEntity = {
        id: '1',
        name: 'Test Entity',
        status: 'active',
        archived: false,
      };
      mockApi.create.mockResolvedValue(newEntity);

      const { result } = renderHook(() =>
        useEntityManager<TestEntity>({ api: mockApi })
      );

      await act(async () => {
        await result.current.create({ name: 'Test Entity' });
      });

      expect(mockApi.create).toHaveBeenCalledWith({ name: 'Test Entity' });
      expect(result.current.items).toContainEqual(newEntity);
      expect(result.current.isLoading).toBe(false);
    });

    it('should return undefined when api.create is not provided', async () => {
      const { result } = renderHook(() =>
        useEntityManager<TestEntity>({ api: {} })
      );

      let created: TestEntity | undefined;
      await act(async () => {
        created = await result.current.create({ name: 'Test' });
      });

      expect(created).toBeUndefined();
    });

    it('should set error when create fails', async () => {
      mockApi.create.mockRejectedValue(new Error('Create failed'));

      const { result } = renderHook(() =>
        useEntityManager<TestEntity>({ api: mockApi })
      );

      await act(async () => {
        await result.current.create({ name: 'Test Entity' });
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Create failed');
    });
  });

  describe('update', () => {
    it('should call update API and return updated item', async () => {
      const updated: TestEntity = {
        id: '1',
        name: 'New Name',
        status: 'active',
        archived: false,
      };

      mockApi.update.mockResolvedValue(updated);

      const { result } = renderHook(() =>
        useEntityManager<TestEntity>({ api: mockApi })
      );

      let returnedItem: TestEntity | undefined;
      await act(async () => {
        returnedItem = await result.current.update('1', { name: 'New Name' });
      });

      expect(mockApi.update).toHaveBeenCalledWith('1', { name: 'New Name' });
      expect(returnedItem).toEqual(updated);
    });

    it('should set error when update fails', async () => {
      mockApi.update.mockRejectedValue(new Error('Update failed'));

      const { result } = renderHook(() =>
        useEntityManager<TestEntity>({ api: mockApi })
      );

      await act(async () => {
        await result.current.update('1', { name: 'New Name' });
      });

      expect(result.current.error?.message).toBe('Update failed');
    });
  });

  describe('archive', () => {
    it('should call archive API and return archived item', async () => {
      const archived: TestEntity = {
        id: '1',
        name: 'Test',
        status: 'active',
        archived: true,
      };

      mockApi.archive.mockResolvedValue(archived);

      const { result } = renderHook(() =>
        useEntityManager<TestEntity>({ api: mockApi })
      );

      let returnedItem: TestEntity | undefined;
      await act(async () => {
        returnedItem = await result.current.archive('1');
      });

      expect(mockApi.archive).toHaveBeenCalledWith('1');
      expect(returnedItem).toEqual(archived);
    });
  });

  describe('restore', () => {
    it('should call restore API and return restored item', async () => {
      const restored: TestEntity = {
        id: '1',
        name: 'Test',
        status: 'active',
        archived: false,
      };

      mockApi.restore.mockResolvedValue(restored);

      const { result } = renderHook(() =>
        useEntityManager<TestEntity>({ api: mockApi })
      );

      let returnedItem: TestEntity | undefined;
      await act(async () => {
        returnedItem = await result.current.restore('1');
      });

      expect(mockApi.restore).toHaveBeenCalledWith('1');
      expect(returnedItem).toEqual(restored);
    });
  });

  describe('deletePermanently', () => {
    it('should remove an item from the list', async () => {
      mockApi.deletePermanently.mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useEntityManager<TestEntity>({ api: mockApi })
      );

      await act(async () => {
        await result.current.deletePermanently('1');
      });

      expect(mockApi.deletePermanently).toHaveBeenCalledWith('1');
    });

    it('should set error when delete fails', async () => {
      mockApi.deletePermanently.mockRejectedValue(new Error('Delete failed'));

      const { result } = renderHook(() =>
        useEntityManager<TestEntity>({ api: mockApi })
      );

      await act(async () => {
        await result.current.deletePermanently('1');
      });

      expect(result.current.error?.message).toBe('Delete failed');
    });
  });

  describe('duplicate', () => {
    it('should duplicate an item', async () => {
      const duplicate: TestEntity = {
        id: '2',
        name: 'Test Entity (Copy)',
        status: 'active',
        archived: false,
      };

      mockApi.duplicate.mockResolvedValue(duplicate);

      const { result } = renderHook(() =>
        useEntityManager<TestEntity>({ api: mockApi })
      );

      await act(async () => {
        await result.current.duplicate('1');
      });

      expect(mockApi.duplicate).toHaveBeenCalledWith('1');
      expect(result.current.items).toContainEqual(duplicate);
    });
  });

  describe('detectDuplicate', () => {
    it('should return false when no detectDuplicate function provided', () => {
      const { result } = renderHook(() =>
        useEntityManager<TestEntity>({ api: mockApi })
      );

      const isDuplicate = result.current.detectDuplicate({ name: 'Test' });
      expect(isDuplicate).toBe(false);
    });

    it('should call detectDuplicate function when provided', () => {
      const detectDuplicate = vi.fn().mockReturnValue(true);

      const { result } = renderHook(() =>
        useEntityManager<TestEntity>({ api: mockApi, detectDuplicate })
      );

      const isDuplicate = result.current.detectDuplicate({ name: 'Test' });

      expect(detectDuplicate).toHaveBeenCalledWith({ name: 'Test' }, []);
      expect(isDuplicate).toBe(true);
    });
  });
});
