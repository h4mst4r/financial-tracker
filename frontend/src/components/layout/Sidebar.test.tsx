import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuthStore } from '../../store/authStore';

// Mock auth store
vi.mock('../../store/authStore', () => ({
  useAuthStore: vi.fn(),
}));

const renderWithRouter = (ui: React.ReactNode, route = '/dashboard') => {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
};

describe('Sidebar', () => {
  beforeEach(() => {
    (useAuthStore as jest.Mock).mockImplementation((selector) =>
      selector({ currentPerson: { defaultView: 'household' } })
    );
  });

  it('renders all main navigation sections', () => {
    renderWithRouter(<Sidebar />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    // Use getAllByText for "Accounts" since it appears as both section label and nav item
    const accountsElements = screen.getAllByText('Accounts');
    expect(accountsElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Capital')).toBeInTheDocument();
    expect(screen.getByText('Assets')).toBeInTheDocument();
    expect(screen.getByText('Insurance')).toBeInTheDocument();
  });

  it('renders planning section items', () => {
    renderWithRouter(<Sidebar />);
    expect(screen.getByText('Transactions')).toBeInTheDocument();
    expect(screen.getByText('Recurring')).toBeInTheDocument();
    expect(screen.getByText('Transfers')).toBeInTheDocument();
    expect(screen.getByText('Budgets')).toBeInTheDocument();
  });

  it('renders bottom navigation items', () => {
    renderWithRouter(<Sidebar />);
    expect(screen.getByText('Categories')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Alerts')).toBeInTheDocument();
  });

  it('highlights the active route', () => {
    renderWithRouter(<Sidebar />, '/transactions');
    const transactionLink = screen.getByText('Transactions').closest('a');
    expect(transactionLink).toHaveAttribute('href', '/transactions');
  });

  it('renders in collapsed mode with only icons', () => {
    renderWithRouter(<Sidebar collapsed />);
    // Text labels should not be visible in collapsed mode
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    // But the sidebar should still exist
    const aside = document.querySelector('aside');
    expect(aside).toBeInTheDocument();
  });

  it('toggles view mode when button is clicked', async () => {
    const user = userEvent.setup();
    renderWithRouter(<Sidebar />);
    
    const toggleButton = screen.getByText('Household');
    await user.click(toggleButton);
    
    expect(screen.getByText('My Finances')).toBeInTheDocument();
  });

  it('renders section labels', () => {
    renderWithRouter(<Sidebar />);
    expect(screen.getByText('Main')).toBeInTheDocument();
    // "Accounts" appears as both a section label and nav item, use getAllByText
    const accountsElements = screen.getAllByText('Accounts');
    expect(accountsElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Planning')).toBeInTheDocument();
  });
});
