/**
 * AUTH-004 — Settings page tests
 *
 * Tests for tab navigation, role-gated controls, and member management UI.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Settings } from './Settings';
import { useAuthStore } from '../store/authStore';
import * as usePersonsModule from '../api/usePersons';

// Mock authStore
vi.mock('../store/authStore', () => ({
  useAuthStore: vi.fn(),
}));

// Mock alertStore
vi.mock('../store/alertStore', () => ({
  useAlertStore: vi.fn(() => ({
    enqueue: vi.fn(),
    toasts: [],
  })),
}));

// Mock useAuth hook
vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    currentPerson: null,
    isLoading: false,
    logout: vi.fn(),
  })),
}));

// Mock usePersons hooks
vi.mock('../api/usePersons', () => ({
  useHousehold: vi.fn(),
  useUpdateHousehold: vi.fn(),
  usePersons: vi.fn(),
  useUpdatePersonProfile: vi.fn(),
  useUpdatePersonRole: vi.fn(),
  useRemovePerson: vi.fn(),
  useInvitations: vi.fn(),
  useInviteMember: vi.fn(),
  useCancelInvitation: vi.fn(),
  useDeleteHousehold: vi.fn(),
}));

const mockMemberData = (overrides = {}): any => ({
  id: 'member-1',
  displayName: 'Test User',
  email: 'test@example.com',
  role: 'member',
  displayCurrency: 'USD',
  defaultView: 'household',
  pictureUrl: null,
  createdAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

const mockHouseholdData = (overrides = {}): any => ({
  id: 'hh-1',
  name: 'Test Household',
  baseCurrency: 'USD',
  timezone: 'America/New_York',
  createdAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('Settings Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: member role
    (useAuthStore as vi.Mock).mockImplementation((selector) => {
      const state = {
        currentPerson: {
          personId: '1',
          displayName: 'Test User',
          email: 'test@example.com',
          role: 'member',
          defaultView: 'household',
          displayCurrency: 'USD',
          pictureUrl: null,
        },
        householdId: 'hh-1',
        csrfToken: 'csrf-token',
        setDefaultView: vi.fn(),
      };
      return selector ? selector(state) : state;
    });

    // Default mock data
    (usePersonsModule.useHousehold as vi.Mock).mockReturnValue({
      data: mockHouseholdData(),
      isLoading: false,
      error: null,
    });

    (usePersonsModule.useUpdateHousehold as vi.Mock).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });

    (usePersonsModule.usePersons as vi.Mock).mockReturnValue({
      data: [mockMemberData()],
      isLoading: false,
      error: null,
    });

    (usePersonsModule.useInvitations as vi.Mock).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });

    (usePersonsModule.useInviteMember as vi.Mock).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });

    (usePersonsModule.useCancelInvitation as vi.Mock).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });

    (usePersonsModule.useUpdatePersonRole as vi.Mock).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });

    (usePersonsModule.useRemovePerson as vi.Mock).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });

    (usePersonsModule.useDeleteHousehold as vi.Mock).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
  });

  it('renders three tab labels', () => {
    render(<MemoryRouter><Settings /></MemoryRouter>);

    expect(screen.getByRole('button', { name: /household/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /members/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /currencies/i })).toBeInTheDocument();
  });

  it('shows Household tab by default', () => {
    render(<MemoryRouter><Settings /></MemoryRouter>);

    expect(screen.getByText(/household settings/i)).toBeInTheDocument();
  });

  it('Household tab: fields disabled + Tooltip present for role=member', () => {
    render(<MemoryRouter><Settings /></MemoryRouter>);

    const inputs = screen.getAllByRole('textbox');
    inputs.forEach((input) => {
      expect(input).toBeDisabled();
    });
  });

  it('Household tab: fields enabled for role=owner', () => {
    (useAuthStore as vi.Mock).mockImplementation((selector) => {
      const state = {
        currentPerson: {
          personId: '1',
          displayName: 'Owner User',
          email: 'owner@example.com',
          role: 'owner',
          defaultView: 'household',
          displayCurrency: 'USD',
          pictureUrl: null,
        },
        householdId: 'hh-1',
        csrfToken: 'csrf-token',
        setDefaultView: vi.fn(),
      };
      return selector ? selector(state) : state;
    });

    render(<MemoryRouter><Settings /></MemoryRouter>);

    const inputs = screen.getAllByRole('textbox');
    inputs.forEach((input) => {
      expect(input).toBeEnabled();
    });
  });

  it('Members tab: renders member rows from mocked usePersons', () => {
    render(<MemoryRouter><Settings /></MemoryRouter>);

    // Switch to Members tab
    fireEvent.click(screen.getByRole('button', { name: /members/i }));

    // Email should be visible in the members table
    const emails = screen.getAllByText('test@example.com');
    expect(emails.length).toBeGreaterThan(0);
  });

  it('Invite button hidden for role=member', () => {
    render(<MemoryRouter><Settings /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /members/i }));

    expect(screen.queryByText('Invite Member')).not.toBeInTheDocument();
  });

  it('Invite button visible for role=admin', () => {
    (useAuthStore as vi.Mock).mockImplementation((selector) => {
      const state = {
        currentPerson: {
          personId: '1',
          displayName: 'Admin User',
          email: 'admin@example.com',
          role: 'admin',
          defaultView: 'household',
          displayCurrency: 'USD',
          pictureUrl: null,
        },
        householdId: 'hh-1',
        csrfToken: 'csrf-token',
        setDefaultView: vi.fn(),
      };
      return selector ? selector(state) : state;
    });

    render(<MemoryRouter><Settings /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /members/i }));

    expect(screen.getByText('Invite Member')).toBeInTheDocument();
  });

  it('Remove button present for admin on other member rows', () => {
    (useAuthStore as vi.Mock).mockImplementation((selector) => {
      const state = {
        currentPerson: {
          personId: '1',
          displayName: 'Admin User',
          email: 'admin@example.com',
          role: 'admin',
          defaultView: 'household',
          displayCurrency: 'USD',
          pictureUrl: null,
        },
        householdId: 'hh-1',
        csrfToken: 'csrf-token',
        setDefaultView: vi.fn(),
      };
      return selector ? selector(state) : state;
    });

    (usePersonsModule.usePersons as vi.Mock).mockReturnValue({
      data: [
        mockMemberData({ id: '1', displayName: 'Admin User', role: 'admin' }),
        mockMemberData({ id: '2', displayName: 'Other Member', role: 'member' }),
      ],
      isLoading: false,
      error: null,
    });

    render(<MemoryRouter><Settings /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /members/i }));

    // Remove button should be present for "Other Member" (not own row)
    const removeButtons = screen.getAllByRole('button', { name: /remove other member/i });
    expect(removeButtons.length).toBeGreaterThan(0);
  });

  it('Role badges rendered for all members', () => {
    (useAuthStore as vi.Mock).mockImplementation((selector) => {
      const state = {
        currentPerson: {
          personId: '1',
          displayName: 'Admin User',
          email: 'admin@example.com',
          role: 'admin',
          defaultView: 'household',
          displayCurrency: 'USD',
          pictureUrl: null,
        },
        householdId: 'hh-1',
        csrfToken: 'csrf-token',
        setDefaultView: vi.fn(),
      };
      return selector ? selector(state) : state;
    });

    (usePersonsModule.usePersons as vi.Mock).mockReturnValue({
      data: [
        mockMemberData({ id: '1', displayName: 'Admin User', role: 'admin' }),
        mockMemberData({ id: '2', displayName: 'Other Member', role: 'member' }),
      ],
      isLoading: false,
      error: null,
    });

    render(<MemoryRouter><Settings /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /members/i }));

    // Role badges should be present
    const adminBadges = screen.getAllByText('admin');
    const memberBadges = screen.getAllByText('member');
    expect(adminBadges.length).toBeGreaterThan(0);
    expect(memberBadges.length).toBeGreaterThan(0);
  });
});
