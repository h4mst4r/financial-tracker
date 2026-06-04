import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { useAuthStore } from './store/authStore';

// Mock useAuth hook
vi.mock('./hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

// Mock the page components to avoid rendering heavy UI
vi.mock('./pages/Dashboard', () => ({
  Dashboard: () => <div data-testid="dashboard">Dashboard</div>,
}));
vi.mock('./pages/Accounts', () => ({
  Accounts: () => <div data-testid="accounts">Accounts</div>,
}));
vi.mock('./pages/Capital', () => ({
  Capital: () => <div>Capital</div>,
}));
vi.mock('./pages/Assets', () => ({
  Assets: () => <div>Assets</div>,
}));
vi.mock('./pages/Insurance', () => ({
  Insurance: () => <div>Insurance</div>,
}));
vi.mock('./pages/Transactions', () => ({
  Transactions: () => <div>Transactions</div>,
}));
vi.mock('./pages/RecurringPayments', () => ({
  RecurringPayments: () => <div>RecurringPayments</div>,
}));
vi.mock('./pages/Transfers', () => ({
  Transfers: () => <div>Transfers</div>,
}));
vi.mock('./pages/Budgets', () => ({
  Budgets: () => <div>Budgets</div>,
}));
vi.mock('./pages/Categories', () => ({
  Categories: () => <div>Categories</div>,
}));
vi.mock('./pages/Settings', () => ({
  Settings: () => <div>Settings</div>,
}));
vi.mock('./pages/Login', () => ({
  Login: () => <div data-testid="login">Login</div>,
}));
vi.mock('./pages/DesignSystem', () => ({
  DesignSystem: () => <div data-testid="design-system">DesignSystem</div>,
}));
vi.mock('./components/layout/AppShell', () => ({
  AppShell: ({ children }) => <div data-testid="app-shell"><aside>Sidebar</aside><main>{children}</main></div>,
}));
vi.mock('./components/ui/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }) => <div>{children}</div>,
}));
vi.mock('./components/ui/Spinner', () => ({
  Spinner: () => <div data-testid="spinner">Loading...</div>,
}));

const mockedUseAuth = vi.mocked(() => ({
  currentPerson: null,
  isLoading: true,
  logout: vi.fn(),
}));

import { useAuth } from './hooks/useAuth';

const renderWithRouter = (ui: React.ReactNode, route = '/dashboard') => {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
};

describe('App', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows loading spinner while auth is initializing', () => {
    (useAuth as vi.Mock).mockReturnValue({
      currentPerson: null,
      isLoading: true,
      logout: vi.fn(),
    });
    renderWithRouter(<App />, '/dashboard');
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('redirects to login when user is not authenticated', async () => {
    (useAuth as vi.Mock).mockReturnValue({
      currentPerson: null,
      isLoading: false,
      logout: vi.fn(),
    });
    renderWithRouter(<App />, '/dashboard');
    // Should show login page, not dashboard
    expect(screen.getByTestId('login')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument();
  });

  it('renders AppShell when user is authenticated', () => {
    (useAuth as vi.Mock).mockReturnValue({
      currentPerson: {
        personId: '1',
        displayName: 'Test User',
        email: 'test@test.com',
        role: 'owner',
        defaultView: 'household',
        displayCurrency: 'SGD',
        pictureUrl: null,
      },
      isLoading: false,
      logout: vi.fn(),
    });
    renderWithRouter(<App />, '/dashboard');
    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard')).toBeInTheDocument();
  });

  it('redirects root path to dashboard when authenticated', () => {
    (useAuth as vi.Mock).mockReturnValue({
      currentPerson: {
        personId: '1',
        displayName: 'Test User',
        email: 'test@test.com',
        role: 'owner',
        defaultView: 'household',
        displayCurrency: 'SGD',
        pictureUrl: null,
      },
      isLoading: false,
      logout: vi.fn(),
    });
    renderWithRouter(<App />, '/');
    expect(screen.getByTestId('dashboard')).toBeInTheDocument();
  });

  it('renders 404 for unknown routes when authenticated', () => {
    (useAuth as vi.Mock).mockReturnValue({
      currentPerson: {
        personId: '1',
        displayName: 'Test User',
        email: 'test@test.com',
        role: 'owner',
        defaultView: 'household',
        displayCurrency: 'SGD',
        pictureUrl: null,
      },
      isLoading: false,
      logout: vi.fn(),
    });
    renderWithRouter(<App />, '/unknown-route');
    expect(screen.getByText(/404|not found/i)).toBeInTheDocument();
  });

  it('renders all defined module routes when authenticated', () => {
    (useAuth as vi.Mock).mockReturnValue({
      currentPerson: {
        personId: '1',
        displayName: 'Test User',
        email: 'test@test.com',
        role: 'owner',
        defaultView: 'household',
        displayCurrency: 'SGD',
        pictureUrl: null,
      },
      isLoading: false,
      logout: vi.fn(),
    });

    const routes = ['/dashboard', '/accounts', '/capital', '/assets', '/insurance', '/transactions', '/recurring-payments', '/transfers', '/budgets', '/categories', '/settings'];

    for (const route of routes) {
      vi.clearAllMocks();
      (useAuth as vi.Mock).mockReturnValue({
        currentPerson: {
          personId: '1',
          displayName: 'Test User',
          email: 'test@test.com',
          role: 'owner',
          defaultView: 'household',
          displayCurrency: 'SGD',
          pictureUrl: null,
        },
        isLoading: false,
        logout: vi.fn(),
      });
      renderWithRouter(<App />, route);
      expect(document.querySelector('main')).toBeInTheDocument();
    }
  });
});
