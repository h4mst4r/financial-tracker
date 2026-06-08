/**
 * Login page — centred card with Google sign-in button.
 * Triggers full page redirect to /auth/login (backend OAuth flow).
 *
 * AUTH-003 — Auth frontend
 * AUTH-005 — refactored to use PublicPage layout component
 */

import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { AlertBanner } from '../components/ui/AlertBanner';
import { PublicPage } from '../components/layout/PublicPage';
import { devLogin } from '../api/useAuthApi';
import { useAuthStore } from '../store/authStore';

/** Inline Google "G" logo SVG */
const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.85C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

export function Login() {
  // Read at render time so vi.stubEnv works in tests (module-level constants are frozen at import)
  const devBypassEnabled = import.meta.env.AUTH_BYPASS_ENABLED === 'true';
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');
  const deleted = searchParams.get('deleted') === '1';
  const declined = searchParams.get('declined') === '1';
  const [devLoading, setDevLoading] = useState(false);
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const errorMessage = useMemo(() => {
    if (!error) return null;
    if (error === 'not_invited') {
      return "You haven't been invited to any household. Ask a household member to send you an invitation link.";
    }
    if (error === 'oauth_error') {
      return 'Sign-in failed. Please try again. If the problem persists, check that your Google account is allowed to access this app.';
    }
    try {
      return decodeURIComponent(error);
    } catch {
      return 'Authentication failed. Please try again.';
    }
  }, [error]);

  const handleSignIn = () => {
    // Note: backend /auth/login ignores any query params — redirect to root OAuth flow
    window.location.href = '/auth/login';
  };

  const handleDevLogin = async () => {
    setDevLoading(true);
    try {
      const data = await devLogin();
      setAuth(
        { ...data.person, defaultView: data.person.defaultView as 'household' | 'personal' },
        data.household?.householdId ?? null,
        data.csrfToken,
      );
      navigate('/');
    } finally {
      setDevLoading(false);
    }
  };

  return (
    <PublicPage
      title="Financial Tracker"
      subtitle={deleted || declined ? undefined : 'Sign in to manage your finances'}
    >
      {deleted && (
        <div className="mb-4">
          <AlertBanner
            variant="success"
            message="Your household has been deleted. Sign in to create a new one."
          />
        </div>
      )}

      {declined && (
        <div className="mb-4">
          <AlertBanner
            variant="info"
            message="Invitation declined. You'll need a new invitation from a household member to join."
          />
        </div>
      )}

      {errorMessage && (
        <div className="mb-4">
          <AlertBanner variant="error" message={errorMessage} />
        </div>
      )}

      <Button
        variant="primary"
        size="lg"
        onClick={handleSignIn}
        className="w-full justify-center"
        aria-label="Sign in with Google"
      >
        <GoogleIcon />
        <span className="truncate">Sign in with Google</span>
      </Button>

      {devBypassEnabled && (
        <Button
          variant="secondary"
          size="lg"
          onClick={handleDevLogin}
          disabled={devLoading}
          className="w-full justify-center mt-3"
          aria-label="Dev Login"
        >
          <span className="truncate">
            {devLoading ? 'Logging in…' : 'Dev Login (bypass Google OAuth)'}
          </span>
        </Button>
      )}
    </PublicPage>
  );
}
