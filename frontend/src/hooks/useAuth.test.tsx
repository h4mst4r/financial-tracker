import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

// Mock authStore
const mockSetAuth = vi.fn();
const mockClearAuth = vi.fn();

vi.mock('../store/authStore', () => ({
  useAuthStore: vi.fn((selector) => {
    const state = {
      currentPerson: null,
      householdId: null,
      csrfToken: null,
      setAuth: mockSetAuth,
      clearAuth: mockClearAuth,
    };
    return selector(state);
  }),
}));

// Mock useAuthApi
const mockFetchMe = vi.fn();
const mockLogoutApi = vi.fn();

vi.mock('../api/useAuthApi', () => ({
  fetchMe: () => mockFetchMe(),
  logout: () => mockLogoutApi(),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetAuth.mockClear();
    mockClearAuth.mockClear();
  });

  it('calls /auth/me on mount', async () => {
    const response = {
      person: {
        personId: '1',
        displayName: 'Test User',
        email: 'test@test.com',
        role: 'owner',
        defaultView: 'household',
        displayCurrency: 'SGD',
        pictureUrl: null,
      },
      household: {
        householdId: 'hh-1',
        name: 'Test Household',
        baseCurrency: 'SGD',
        timezone: 'Asia/Singapore',
      },
      csrfToken: 'test-token',
    };
    mockFetchMe.mockResolvedValue(response);

    const { useAuth } = await import('./useAuth');
    renderHook(() => useAuth(), { wrapper });

    await vi.waitFor(() => {
      expect(mockFetchMe).toHaveBeenCalled();
    });
  });

  it('populates authStore on success', async () => {
    const response = {
      person: {
        personId: '1',
        displayName: 'Test User',
        email: 'test@test.com',
        role: 'owner',
        defaultView: 'household',
        displayCurrency: 'SGD',
        pictureUrl: 'https://example.com/photo.jpg',
      },
      household: {
        householdId: 'hh-1',
        name: 'Test Household',
        baseCurrency: 'SGD',
        timezone: 'Asia/Singapore',
      },
      csrfToken: 'test-token',
    };
    mockFetchMe.mockResolvedValue(response);

    const { useAuth } = await import('./useAuth');
    renderHook(() => useAuth(), { wrapper });

    await vi.waitFor(() => {
      expect(mockSetAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          personId: '1',
          displayName: 'Test User',
          email: 'test@test.com',
          role: 'owner',
          defaultView: 'household',
          displayCurrency: 'SGD',
          pictureUrl: 'https://example.com/photo.jpg',
        }),
        'hh-1',
        'test-token'
      );
    });
  });

  it('navigates to /login on 401 and clears auth', async () => {
    // Import ApiError so we can throw a properly typed 401
    const { ApiError } = await import('../api/client');
    mockFetchMe.mockRejectedValue(new ApiError(401, '/auth/me', 'Unauthorized'));

    const { useAuth } = await import('./useAuth');
    renderHook(() => useAuth(), { wrapper });

    await vi.waitFor(() => {
      expect(mockClearAuth).toHaveBeenCalled();
    });
  });

  it('sets authError on non-401 server error without clearing auth', async () => {
    const { ApiError } = await import('../api/client');
    mockFetchMe.mockRejectedValue(new ApiError(500, '/auth/me', 'Internal Server Error'));

    const { useAuth } = await import('./useAuth');
    const { result } = renderHook(() => useAuth(), { wrapper });

    await vi.waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.authError).toBe(true);
    expect(mockClearAuth).not.toHaveBeenCalled();
  });

  it('exposes logout function that clears auth and navigates', async () => {
    mockFetchMe.mockResolvedValue({
      person: {
        personId: '1',
        displayName: 'Test User',
        email: 'test@test.com',
        role: 'owner',
        defaultView: 'household',
        displayCurrency: 'SGD',
        pictureUrl: null,
      },
      household: {
        householdId: 'hh-1',
        name: 'Test Household',
        baseCurrency: 'SGD',
        timezone: 'Asia/Singapore',
      },
      csrfToken: 'test-token',
    });
    mockLogoutApi.mockResolvedValue(undefined);

    const { useAuth } = await import('./useAuth');
    const { result } = renderHook(() => useAuth(), { wrapper });

    // Wait for initial fetch to complete
    await vi.waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Call logout
    result.current.logout();

    await vi.waitFor(() => {
      expect(mockLogoutApi).toHaveBeenCalled();
      expect(mockClearAuth).toHaveBeenCalled();
    });
  });
});
