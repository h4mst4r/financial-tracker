import { render, screen } from '@testing-library/react';
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

  it('renders avatar link to settings', () => {
    renderWithRouter(<Topbar pageTitle="Test" />);
    // Avatar link navigates to /settings — displays the user's display name
    const avatarLink = screen.getByRole('link', { name: /test user/i });
    expect(avatarLink).toBeInTheDocument();
  });
});
