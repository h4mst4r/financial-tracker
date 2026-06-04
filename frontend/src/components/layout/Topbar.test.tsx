import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Topbar } from './Topbar';
import { useAlertStore } from '../../store/alertStore';
import { useAuthStore } from '../../store/authStore';

vi.mock('../../store/alertStore', () => ({
  useAlertStore: vi.fn(),
}));

vi.mock('../../store/authStore', () => ({
  useAuthStore: vi.fn(),
}));

const mockLogout = vi.fn();
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ currentPerson: null, isLoading: false, logout: mockLogout }),
}));

const renderWithRouter = (ui: React.ReactNode, route = '/dashboard') => {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
};

describe('Topbar', () => {
  beforeEach(() => {
    (useAlertStore as jest.Mock).mockImplementation((selector) =>
      selector({ toasts: [] })
    );
    (useAuthStore as jest.Mock).mockImplementation((selector) =>
      selector({
        currentPerson: {
          personId: 'test-1',
          displayName: 'Test User',
          email: 'test@example.com',
          defaultView: 'household' as const,
          displayCurrency: 'USD',
        },
        householdId: 'hh-1',
        csrfToken: 'token-123',
      })
    );
  });

  it('renders page title', () => {
    renderWithRouter(<Topbar pageTitle="Accounts" />);
    expect(screen.getByText('Accounts')).toBeInTheDocument();
  });

  it('renders header element', () => {
    renderWithRouter(<Topbar pageTitle="Dashboard" />);
    const topbar = document.querySelector('header');
    expect(topbar).toBeInTheDocument();
  });

  it('renders alert bell link', () => {
    renderWithRouter(<Topbar pageTitle="Test" />);
    // The bell is a <Link> with a Tooltip — query by href to /alerts
    const bellLink = screen.getByRole('link', { name: /alert/i });
    expect(bellLink).toBeInTheDocument();
  });

  it('displays unread indicator on bell when error/warning toasts exist', () => {
    (useAlertStore as jest.Mock).mockImplementation((selector) =>
      selector({
        toasts: [
          { id: '1', variant: 'error', title: 'Error' },
          { id: '2', variant: 'warning', title: 'Warning' },
        ],
      })
    );
    renderWithRouter(<Topbar pageTitle="Test" />);
    // The bell should have a red dot indicator
    const indicator = document.querySelector('.bg-error');
    expect(indicator).toBeInTheDocument();
  });

  it('renders user account menu button', () => {
    renderWithRouter(<Topbar pageTitle="Test" />);
    const menuButton = screen.getByRole('button', { name: /user account menu/i });
    expect(menuButton).toBeInTheDocument();
  });

  it('opens account menu on avatar button click showing user name and email', () => {
    renderWithRouter(<Topbar pageTitle="Test" />);
    const menuButton = screen.getByRole('button', { name: /user account menu/i });
    fireEvent.click(menuButton);
    // Name appears in both trigger and header; email is only in the menu header
    expect(screen.getAllByText('Test User').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  it('shows Settings and Log out items in account menu', () => {
    renderWithRouter(<Topbar pageTitle="Test" />);
    fireEvent.click(screen.getByRole('button', { name: /user account menu/i }));
    expect(screen.getByRole('menuitem', { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /log out/i })).toBeInTheDocument();
  });

  it('calls logout when Log out menu item is clicked', () => {
    renderWithRouter(<Topbar pageTitle="Test" />);
    fireEvent.click(screen.getByRole('button', { name: /user account menu/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /log out/i }));
    expect(mockLogout).toHaveBeenCalledOnce();
  });
});
