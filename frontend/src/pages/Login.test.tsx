import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Login } from './Login';
import * as useAuthApiModule from '../api/useAuthApi';

vi.mock('../components/ui/Button', () => ({
  Button: ({ children, onClick, className, 'aria-label': ariaLabel, disabled }) => (
    <button onClick={onClick} className={className} aria-label={ariaLabel} disabled={disabled}>
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

// Mock useNavigate — preserved across all tests; individual tests capture calls via mockNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

// Mock authStore — capture setAuth calls
const mockSetAuth = vi.fn();
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: (s: object) => unknown) =>
    selector({
      currentPerson: null,
      householdId: null,
      csrfToken: null,
      setAuth: mockSetAuth,
      clearAuth: vi.fn(),
      setDefaultView: vi.fn(),
    }),
}));

const renderWithRouter = (ui: React.ReactNode, path = '/login') => {
  return render(
    <MemoryRouter initialEntries={[path]}>
      {ui}
    </MemoryRouter>
  );
};

const DEV_AUTH_RESPONSE: useAuthApiModule.AuthMeResponse = {
  person: {
    personId: 'dev-person-id',
    displayName: 'Dev User',
    email: 'dev@localhost',
    role: 'owner',
    defaultView: 'household',
    displayCurrency: 'SGD',
    pictureUrl: null,
  },
  household: {
    householdId: 'dev-household-id',
    name: 'Dev Household',
    baseCurrency: 'SGD',
    timezone: 'Asia/Singapore',
  },
  csrfToken: 'dev-csrf-token',
  pendingInvitationToken: null,
  isFirstLogin: false,
};

describe('Login', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default to bypass disabled so tests are independent of the local .env value.
    vi.stubEnv('AUTH_BYPASS_ENABLED', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

  it('does NOT render Dev Login button when AUTH_BYPASS_ENABLED is not set', () => {
    // Default: env var absent → no dev button
    renderWithRouter(<Login />);
    expect(screen.queryByRole('button', { name: /dev login/i })).not.toBeInTheDocument();
  });

  it('renders Dev Login button when AUTH_BYPASS_ENABLED=true', () => {
    vi.stubEnv('AUTH_BYPASS_ENABLED', 'true');
    renderWithRouter(<Login />);
    expect(screen.getByRole('button', { name: /dev login/i })).toBeInTheDocument();
    expect(screen.getByText(/dev login \(bypass google oauth\)/i)).toBeInTheDocument();
  });

  it('Dev Login button calls devLogin, stores session, calls setAuth, and navigates to /', async () => {
    vi.stubEnv('AUTH_BYPASS_ENABLED', 'true');

    // Spy on devLogin — must be resolved before click
    const devLoginSpy = vi.spyOn(useAuthApiModule, 'devLogin').mockResolvedValue(DEV_AUTH_RESPONSE);

    renderWithRouter(<Login />);

    const devButton = screen.getByRole('button', { name: /dev login/i });
    fireEvent.click(devButton);

    await waitFor(() => {
      expect(devLoginSpy).toHaveBeenCalledOnce();
    });

    await waitFor(() => {
      expect(mockSetAuth).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'dev@localhost', defaultView: 'household' }),
        'dev-household-id',
        'dev-csrf-token',
      );
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('Dev Login button shows loading state during API call', async () => {
    vi.stubEnv('AUTH_BYPASS_ENABLED', 'true');

    // Return a never-resolving promise so the loading state stays visible
    vi.spyOn(useAuthApiModule, 'devLogin').mockReturnValue(new Promise(() => {}));

    renderWithRouter(<Login />);
    fireEvent.click(screen.getByRole('button', { name: /dev login/i }));

    await waitFor(() => {
      expect(screen.getByText(/logging in/i)).toBeInTheDocument();
    });
  });
});
