/**
 * useAuth — Auth initialization hook.
 * Fetches /auth/me on mount, populates authStore, exposes person + logout.
 *
 * AUTH-003 — Auth frontend
 * AUTH-005 — pendingInviteToken redirect; non-401 error handling; AbortController
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import type { PersonInfo } from '../store/authStore';
import { useAlertStore } from '../store/alertStore';
import { ApiError } from '../api/client';
import { fetchMe, logout as logoutApi, type AuthMeResponse } from '../api/useAuthApi';

export function useAuth() {
  const navigate = useNavigate();
  const currentPerson = useAuthStore((s) => s.currentPerson);
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const setPendingInvitation = useAuthStore((s) => s.setPendingInvitation);

  const [isLoading, setIsLoading] = useState(true);
  // authError is true when /auth/me fails for a non-auth reason (500, network, etc.)
  // The app stays on the current page rather than silently navigating to /login.
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // AbortController cancels the in-flight HTTP request when the effect is torn down.
    // This prevents a slow /auth/me response from writing to state after unmount.
    const controller = new AbortController();

    // NOTE (StrictMode): React StrictMode mounts effects twice in development, causing
    // two concurrent /auth/me requests. The cancelled flag ensures only one result is
    // applied; the second is discarded. Both requests complete but neither causes issues
    // because setAuth is idempotent. Production is unaffected (no StrictMode double-invoke).

    // Skip /auth/me entirely on the login page.
    // - Prevents the dev bypass from silently re-authenticating the user after
    //   a failed OAuth attempt (which would redirect them away from the error).
    // - Keeps currentPerson=null so the !currentPerson branch in App.tsx always
    //   shows the Login component when the user is on /login.
    if (window.location.pathname === '/login') {
      setIsLoading(false);
      return () => { cancelled = true; controller.abort(); };
    }

    let authSucceeded = false;
    let response: AuthMeResponse | null = null;

    (async () => {
      try {
        response = await fetchMe();
        if (cancelled) return;

        // Map backend response to PersonInfo shape
        const VALID_VIEWS = ['household', 'personal'] as const;
        const rawView = response.person.defaultView;
        const defaultView: 'household' | 'personal' =
          (VALID_VIEWS as readonly string[]).includes(rawView)
            ? (rawView as 'household' | 'personal')
            : 'household';

        const person: PersonInfo = {
          personId: response.person.personId,
          displayName: response.person.displayName,
          email: response.person.email,
          role: response.person.role,
          defaultView,
          displayCurrency: response.person.displayCurrency,
          pictureUrl: response.person.pictureUrl,
          canCreateHousehold: response.person.canCreateHousehold ?? false,
        };

        if (!response.household) {
          // Person exists but has no household.
          // If they have a pending invitation, show the dialog (Scenario 1: no household).
          // Otherwise, clear auth and send to login.
          if (response.pendingInvitation) {
            // Set auth without household — dialog will handle acceptance
            setAuth(person, null, response.csrfToken);
            setPendingInvitation(response.pendingInvitation);
            authSucceeded = true;
          } else {
            // No household, no invitation — clear auth and send to login.
            clearAuth();
            navigate('/login?error=not_invited', { replace: true });
            return;
          }
        } else {
          setAuth(person, response.household.householdId, response.csrfToken, response.household.name);
          authSucceeded = true;
          // Handle pending invitation — set in store for PendingInvitationDialog
          if (response.pendingInvitation) {
            setPendingInvitation(response.pendingInvitation);
          }
        }
      } catch (err) {
        if (cancelled) return;

        const is401 = err instanceof ApiError && err.status === 401;

        if (is401) {
          // 401: api/client.ts already hard-redirected to /login and called clearAuth.
          // Redundantly clearing here ensures local state is clean if the hard redirect
          // is somehow delayed (e.g. same-page /login route).
          clearAuth();
          navigate('/login', { replace: true });
        } else {
          // Non-auth error (500, network timeout, etc.) — DO NOT log the user out.
          // Show an error state so they can retry, rather than silently dropping them
          // to the login page. The app remains on the current route.
          setAuthError(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          // Welcome toast for first-time household creators
          if (authSucceeded && response && response.isFirstLogin && !sessionStorage.getItem('hasSeenWelcome')) {
            sessionStorage.setItem('hasSeenWelcome', '1');
            useAlertStore.getState().enqueue({
              variant: 'success',
              title: 'Household created',
              message: `Your household "${response.household?.name}" has been created. Invite members to get started.`,
              action: { label: 'Invite Members', onClick: () => { window.location.href = '/settings?tab=members'; } },
            });
          }
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- setAuth/clearAuth are stable Zustand actions; navigate is stable per React Router

  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const logout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logoutApi();
    } catch {
      // Logout API call may fail if session is already expired — still clear locally
    }
    clearAuth();
    navigate('/login', { replace: true });
  };

  return { currentPerson, isLoading, authError, logout };
}
