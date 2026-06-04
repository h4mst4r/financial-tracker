/**
 * AUTH-005 — JoinHousehold page tests
 *
 * Tests for invitation preview, error states, and accept flow.
 * Updated to match corrected AC 3/4/5 implementation:
 *  - Skeleton shape="card" (animate-shimmer, not animate-pulse)
 *  - AlertBanner for error states with "Back to Login" button
 *  - "Accept Invitation" primary CTA for both auth states
 *  - "Decline" secondary CTA for both auth states
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as clientModule from '../api/client';
import { useAuthStore } from '../store/authStore';
import { JoinHousehold } from './JoinHousehold';

// Mock authStore
vi.mock('../store/authStore', () => ({
  useAuthStore: vi.fn(),
}));

// Mock api client
vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number;
    endpoint: string;
    constructor(status: number, endpoint: string, message?: string) {
      super(message ?? `API error (${status})`);
      this.name = 'ApiError';
      this.status = status;
      this.endpoint = endpoint;
    }
  },
}));

const makeQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

const makeWrapper =
  (qc: QueryClient): React.FC<{ children: React.ReactNode }> =>
  ({ children }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

const validInvitationData = {
  data: {
    householdName: 'Test Household',
    invitedByDisplayName: 'John Doe',
    invitedEmail: 'test@example.com',
    expiresAt: '2026-12-31T23:59:59Z',
    status: 'pending',
  },
};

describe('JoinHousehold', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthStore as vi.Mock).mockImplementation((fn) => fn({ currentPerson: null }));
  });

  it('shows loading skeleton (animate-shimmer) while fetching', () => {
    const qc = makeQueryClient();
    const mockApiGet = clientModule.api.get as vi.Mock;
    mockApiGet.mockReturnValue(new Promise(() => {})); // Never resolves

    render(
      <MemoryRouter initialEntries={['/join/test-token']}>
        <Routes>
          <Route path="/join/:token" element={<JoinHousehold />} />
        </Routes>
      </MemoryRouter>,
      { wrapper: makeWrapper(qc) }
    );

    // Skeleton shape="card" renders divs with animate-shimmer class
    expect(document.querySelector('.animate-shimmer')).toBeTruthy();
  });

  it('shows AlertBanner and Back to Login button for 404', async () => {
    const qc = makeQueryClient();
    const mockApiGet = clientModule.api.get as vi.Mock;
    mockApiGet.mockRejectedValue({ status: 404, name: 'ApiError', message: 'Not found' });

    render(
      <MemoryRouter initialEntries={['/join/bad-token']}>
        <Routes>
          <Route path="/join/:token" element={<JoinHousehold />} />
        </Routes>
      </MemoryRouter>,
      { wrapper: makeWrapper(qc) }
    );

    await waitFor(() => {
      expect(screen.getByText('Invitation not found')).toBeTruthy();
      expect(screen.getByRole('button', { name: /back to login/i })).toBeTruthy();
    });
  });

  it('shows AlertBanner and Back to Login button for 410', async () => {
    const qc = makeQueryClient();
    const mockApiGet = clientModule.api.get as vi.Mock;
    mockApiGet.mockRejectedValue({ status: 410, name: 'ApiError', message: 'Gone' });

    render(
      <MemoryRouter initialEntries={['/join/expired-token']}>
        <Routes>
          <Route path="/join/:token" element={<JoinHousehold />} />
        </Routes>
      </MemoryRouter>,
      { wrapper: makeWrapper(qc) }
    );

    await waitFor(() => {
      expect(screen.getByText('This invitation has expired or is no longer valid')).toBeTruthy();
      expect(screen.getByRole('button', { name: /back to login/i })).toBeTruthy();
    });
  });

  it('shows invitation card with household name and invited-by', async () => {
    const qc = makeQueryClient();
    const mockApiGet = clientModule.api.get as vi.Mock;
    mockApiGet.mockResolvedValue(validInvitationData);

    render(
      <MemoryRouter initialEntries={['/join/valid-token']}>
        <Routes>
          <Route path="/join/:token" element={<JoinHousehold />} />
        </Routes>
      </MemoryRouter>,
      { wrapper: makeWrapper(qc) }
    );

    await waitFor(() => {
      expect(screen.getByText('Test Household')).toBeTruthy();
      expect(screen.getByText(/John Doe/)).toBeTruthy();
    });
  });

  it('shows "Accept Invitation" and "Decline" when unauthenticated', async () => {
    const qc = makeQueryClient();
    const mockApiGet = clientModule.api.get as vi.Mock;
    mockApiGet.mockResolvedValue(validInvitationData);
    (useAuthStore as vi.Mock).mockImplementation((fn) => fn({ currentPerson: null }));

    render(
      <MemoryRouter initialEntries={['/join/valid-token']}>
        <Routes>
          <Route path="/join/:token" element={<JoinHousehold />} />
        </Routes>
      </MemoryRouter>,
      { wrapper: makeWrapper(qc) }
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /accept invitation/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /decline/i })).toBeTruthy();
    });
  });

  it('shows "Accept Invitation" and "Decline" when authenticated', async () => {
    const qc = makeQueryClient();
    const mockApiGet = clientModule.api.get as vi.Mock;
    mockApiGet.mockResolvedValue(validInvitationData);
    (useAuthStore as vi.Mock).mockImplementation((fn) =>
      fn({ currentPerson: { id: 'p1', displayName: 'Test', email: 'test@example.com', role: 'member' } })
    );

    render(
      <MemoryRouter initialEntries={['/join/valid-token']}>
        <Routes>
          <Route path="/join/:token" element={<JoinHousehold />} />
        </Routes>
      </MemoryRouter>,
      { wrapper: makeWrapper(qc) }
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /accept invitation/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /decline/i })).toBeTruthy();
    });
  });
});
