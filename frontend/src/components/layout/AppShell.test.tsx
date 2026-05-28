import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from './AppShell';

const renderWithRouter = (ui: React.ReactNode, route = '/dashboard') => {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
};

describe('AppShell', () => {
  it('renders children content', () => {
    renderWithRouter(
      <AppShell>
        <div data-testid="child-content">Test Content</div>
      </AppShell>
    );
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
  });

  it('renders sidebar component', () => {
    renderWithRouter(<AppShell><div>Content</div></AppShell>);
    // Sidebar should be present in the DOM
    const sidebar = document.querySelector('aside');
    expect(sidebar).toBeInTheDocument();
  });

  it('renders topbar component', () => {
    renderWithRouter(<AppShell><div>Content</div></AppShell>);
    // Topbar should be present
    const topbar = document.querySelector('header');
    expect(topbar).toBeInTheDocument();
  });

  it('displays correct page title based on route', () => {
    renderWithRouter(<AppShell><div>Content</div></AppShell>, '/transactions');
    // Get the h1 element which is the page title in the topbar
    const pageTitle = document.querySelector('h1.text-lg');
    expect(pageTitle)?.toHaveTextContent('Transactions');
  });

  it('renders main content area with correct structure', () => {
    renderWithRouter(<AppShell><div>Content</div></AppShell>);
    const main = document.querySelector('main');
    expect(main).toBeInTheDocument();
  });
});
