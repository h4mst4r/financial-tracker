import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Login } from './Login';

vi.mock('../components/ui/Button', () => ({
  Button: ({ children, onClick, className, 'aria-label': ariaLabel }) => (
    <button onClick={onClick} className={className} aria-label={ariaLabel}>
      {children}
    </button>
  ),
}));

vi.mock('../components/ui/AlertBanner', () => ({
  AlertBanner: ({ variant, message }) => (
    <div data-testid="alert-banner" data-variant={variant}>
      {message}
    </div>
  ),
}));

vi.mock('../components/ui/Icon', () => ({
  Icon: () => <span>icon</span>,
}));

const renderWithRouter = (ui: React.ReactNode, path = '/login') => {
  return render(
    <MemoryRouter initialEntries={[path]}>
      {ui}
    </MemoryRouter>
  );
};

describe('Login', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders the Google sign-in button', () => {
    renderWithRouter(<Login />);
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
  });

  it('renders error banner when ?error query param is present', () => {
    renderWithRouter(<Login />, '/login?error=Authentication+denied');
    expect(screen.getByTestId('alert-banner')).toBeInTheDocument();
    expect(screen.getByTestId('alert-banner')).toHaveAttribute('data-variant', 'error');
  });

  it('does NOT render email/password inputs', () => {
    renderWithRouter(<Login />);
    expect(screen.queryByPlaceholderText(/email/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/username/i)).not.toBeInTheDocument();
  });

  it('does NOT render "Remember me" checkbox', () => {
    renderWithRouter(<Login />);
    expect(screen.queryByText(/remember me/i)).not.toBeInTheDocument();
  });

  it('does NOT render "Forgot password" link', () => {
    renderWithRouter(<Login />);
    expect(screen.queryByText(/forgot password/i)).not.toBeInTheDocument();
  });

  it('triggers full page redirect on sign-in click', () => {
    const originalLocation = window.location;
    const mockLocation = { ...originalLocation, href: '' };
    Object.defineProperty(window, 'location', {
      value: mockLocation,
      writable: true,
    });

    renderWithRouter(<Login />);
    screen.getByRole('button', { name: /sign in with google/i }).click();

    expect(mockLocation.href).toBe('/auth/login');

    // Restore
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    });
  });
});
