import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { useAuthStore } from './store/authStore';

vi.mock('./store/authStore', () => ({
  useAuthStore: vi.fn(),
}));

const renderWithRouter = (ui: React.ReactNode, route = '/dashboard') => {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
};

describe('App', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('redirects to login when user is not authenticated', () => {
    (useAuthStore as jest.Mock).mockImplementation((selector) =>
      selector({ currentPerson: null })
    );
    renderWithRouter(<App />, '/dashboard');
    // Should redirect to /login
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });

  it('renders AppShell when user is authenticated', () => {
    (useAuthStore as jest.Mock).mockImplementation((selector) =>
      selector({ currentPerson: { id: '1', username: 'testuser' } })
    );
    renderWithRouter(<App />);
    // AppShell should be rendered with sidebar
    const aside = document.querySelector('aside');
    expect(aside).toBeInTheDocument();
  });

  it('redirects root path to dashboard', () => {
    (useAuthStore as jest.Mock).mockImplementation((selector) =>
      selector({ currentPerson: { id: '1', username: 'testuser' } })
    );
    renderWithRouter(<App />, '/');
    // Should redirect to /dashboard
    const dashboard = document.querySelector('main');
    expect(dashboard).toBeInTheDocument();
  });

  it('renders 404 for unknown routes', () => {
    (useAuthStore as jest.Mock).mockImplementation((selector) =>
      selector({ currentPerson: { id: '1', username: 'testuser' } })
    );
    renderWithRouter(<App />, '/unknown-route');
    // Should show 404 or not found content
    expect(screen.getByText(/404|not found/i)).toBeInTheDocument();
  });

  it('renders all defined module routes', () => {
    (useAuthStore as jest.Mock).mockImplementation((selector) =>
      selector({ currentPerson: { id: '1', username: 'testuser' } })
    );
    
    const routes = ['/dashboard', '/accounts', '/capital', '/assets', '/insurance', '/transactions', '/recurring-payments', '/transfers', '/budgets', '/categories', '/settings'];
    
    for (const route of routes) {
      vi.clearAllMocks();
      renderWithRouter(<App />, route);
      // Should not throw and should render AppShell
      expect(document.querySelector('main')).toBeInTheDocument();
    }
  });
});
