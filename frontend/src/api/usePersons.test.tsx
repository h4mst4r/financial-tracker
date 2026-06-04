/**
 * AUTH-004 — usePersons API hooks tests
 *
 * Tests for TanStack Query hooks calling household/persons/invitations endpoints.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as clientModule from './client';
import {
  useHousehold,
  useUpdateHousehold,
  usePersons,
  useUpdatePersonProfile,
  useUpdatePersonRole,
  useRemovePerson,
  useInvitations,
  useInviteMember,
  useCancelInvitation,
} from './usePersons';

// Mock api client
vi.mock('./client', () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('usePersons hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('useHousehold calls GET /api/household', async () => {
    const mockData = {
      id: 'hh-1',
      name: 'Test Household',
      baseCurrency: 'USD',
      timezone: 'America/New_York',
      createdAt: '2026-01-01T00:00:00Z',
    };

    (clientModule.api.get as vi.Mock).mockResolvedValue({ data: mockData });

    const { result } = renderHook(() => useHousehold(), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual(mockData);
    });

    expect(clientModule.api.get).toHaveBeenCalledWith('/api/household');
  });

  it('useUpdateHousehold calls PATCH /api/household', async () => {
    const mockData = {
      id: 'hh-1',
      name: 'Updated Household',
      baseCurrency: 'USD',
      timezone: 'America/New_York',
      createdAt: '2026-01-01T00:00:00Z',
    };

    (clientModule.api.patch as vi.Mock).mockResolvedValue({ data: mockData });

    const { result } = renderHook(() => useUpdateHousehold(), { wrapper });

    result.current.mutate({ name: 'Updated Household' });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(clientModule.api.patch).toHaveBeenCalledWith('/api/household', {
      name: 'Updated Household',
    });
  });

  it('usePersons calls GET /api/persons', async () => {
    const mockData = [
      {
        id: '1',
        displayName: 'Test User',
        email: 'test@example.com',
        role: 'member',
        displayCurrency: 'USD',
        defaultView: 'household',
        pictureUrl: null,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];

    (clientModule.api.get as vi.Mock).mockResolvedValue({ data: mockData });

    const { result } = renderHook(() => usePersons(), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual(mockData);
    });

    expect(clientModule.api.get).toHaveBeenCalledWith('/api/persons');
  });

  it('useUpdatePersonProfile calls PATCH /api/persons/{id}', async () => {
    const mockData = {
      id: '1',
      displayName: 'Updated Name',
      email: 'test@example.com',
      role: 'member',
      displayCurrency: 'USD',
      defaultView: 'personal',
      pictureUrl: null,
      createdAt: '2026-01-01T00:00:00Z',
    };

    (clientModule.api.patch as vi.Mock).mockResolvedValue({ data: mockData });

    const { result } = renderHook(() => useUpdatePersonProfile(), { wrapper });

    result.current.mutate({
      id: '1',
      update: { defaultView: 'personal' },
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(clientModule.api.patch).toHaveBeenCalledWith('/api/persons/1', {
      defaultView: 'personal',
    });
  });

  it('useUpdatePersonRole calls PATCH /api/persons/{id}/role', async () => {
    const mockData = {
      id: '2',
      displayName: 'Other User',
      email: 'other@example.com',
      role: 'admin',
      displayCurrency: 'USD',
      defaultView: 'household',
      pictureUrl: null,
      createdAt: '2026-01-01T00:00:00Z',
    };

    (clientModule.api.patch as vi.Mock).mockResolvedValue({ data: mockData });

    const { result } = renderHook(() => useUpdatePersonRole(), { wrapper });

    result.current.mutate({ id: '2', role: 'admin' });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(clientModule.api.patch).toHaveBeenCalledWith('/api/persons/2/role', {
      role: 'admin',
    });
  });

  it('useRemovePerson calls DELETE /api/persons/{id}', async () => {
    (clientModule.api.delete as vi.Mock).mockResolvedValue({ data: {} });

    const { result } = renderHook(() => useRemovePerson(), { wrapper });

    result.current.mutate('2');

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(clientModule.api.delete).toHaveBeenCalledWith('/api/persons/2');
  });

  it('useInvitations calls GET /api/persons/invitations', async () => {
    const mockData = [
      {
        id: 'inv-1',
        householdId: 'hh-1',
        invitedEmail: 'invite@example.com',
        invitedBy: '1',
        createdAt: '2026-01-01T00:00:00Z',
        expiresAt: '2026-01-08T00:00:00Z',
        acceptedAt: null,
        status: 'pending',
      },
    ];

    (clientModule.api.get as vi.Mock).mockResolvedValue({ data: mockData });

    const { result } = renderHook(() => useInvitations(), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual(mockData);
    });

    expect(clientModule.api.get).toHaveBeenCalledWith('/api/persons/invitations');
  });

  it('useInviteMember calls POST /api/persons/invite', async () => {
    const mockData = {
      id: 'inv-1',
      householdId: 'hh-1',
      invitedEmail: 'new@example.com',
      invitedBy: '1',
      createdAt: '2026-01-01T00:00:00Z',
      expiresAt: '2026-01-08T00:00:00Z',
      acceptedAt: null,
      status: 'pending',
    };

    (clientModule.api.post as vi.Mock).mockResolvedValue({ data: mockData });

    const { result } = renderHook(() => useInviteMember(), { wrapper });

    result.current.mutate({ invitedEmail: 'new@example.com' });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(clientModule.api.post).toHaveBeenCalledWith('/api/persons/invite', {
      invitedEmail: 'new@example.com',
    });
  });

  it('useCancelInvitation calls DELETE /api/persons/invitations/{id}', async () => {
    const mockData = {
      id: 'inv-1',
      householdId: 'hh-1',
      invitedEmail: 'invite@example.com',
      invitedBy: '1',
      createdAt: '2026-01-01T00:00:00Z',
      expiresAt: '2026-01-08T00:00:00Z',
      acceptedAt: null,
      status: 'cancelled',
    };

    (clientModule.api.delete as vi.Mock).mockResolvedValue({ data: mockData });

    const { result } = renderHook(() => useCancelInvitation(), { wrapper });

    result.current.mutate('inv-1');

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(clientModule.api.delete).toHaveBeenCalledWith(
      '/api/persons/invitations/inv-1',
    );
  });
});
