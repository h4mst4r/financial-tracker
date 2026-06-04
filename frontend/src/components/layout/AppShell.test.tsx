import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './AppShell';
import { useAuthStore } from '../../store/authStore';
import { useAlertStore } from '../../store/alertStore';

vi.mock('../../store/authStore', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('../../store/alertStore', () => ({
  useAlertStore: vi.fn(),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ currentPerson: null, isLoading: false, logout: vi.fn() }),
}));

const renderWithProviders = (ui: React.ReactNode, route = '/dashboard') => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  (useAuthStore as jest.Mock).mockImplementation((selector) =>
    selector({
      currentPerson: {
        personId: 'test-1',
        displayName: 'Test User',
        email: 'test@example.com',
        role: 'owner',
        defaultView: 'household',
        displayCurrency: 'SGD',
        pictureUrl: null,
      },
      householdId: 'test-household',
      csrfToken: 'test-token',
      setAuth: vi.fn(),
      setDefaultView: vi.fn(),
    })
  );
  (useAlertStore as jest.Mock).mockImplementation((selector) =>
    selector({ toasts: [], enqueue: vi.fn() })
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
};

describe('AppShell', () => {
  it('renders children content', () => {
    renderWithProviders(
      <AppShell>
        <div data-testid="child-content">Test Content</div>
      </AppShell>
    );
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
  });

  it('renders sidebar component', () => {
    renderWithProviders(<AppShell><div>Content</div></AppShell>);
    const sidebar = document.querySelector('aside');
    expect(sidebar).toBeInTheDocument();
  });

  it('renders topbar component', () => {
    renderWithProviders(<AppShell><div>Content</div></AppShell>);
    const topbar = document.querySelector('header');
    expect(topbar).toBeInTheDocument();
  });

  it('displays correct page title based on route', () => {
    renderWithProviders(<AppShell><div>Content</div></AppShell>, '/transactions');
    const pageTitle = document.querySelector('h1.text-lg');
    expect(pageTitle)?.toHaveTextContent('Transactions');
  });

  it('renders main content area with correct structure', () => {
    renderWithProviders(<AppShell><div>Content</div></AppShell>);
    const main = document.querySelector('main');
    expect(main).toBeInTheDocument();
  });
});
