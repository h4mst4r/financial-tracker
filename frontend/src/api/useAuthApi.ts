/**
 * Thin API wrapper for auth endpoints.
 * Uses the base api client which handles CSRF injection and 401 → clearAuth automatically.
 *
 * AUTH-003 — Auth frontend
 */

import { api } from './client';
import type { PendingInvitation } from '../types/auth';

// --- Response Types ---

/** Matches the exact shape returned by GET /auth/me (ARCH §7.2a, enriched in AUTH-001) */
export interface AuthMeResponse {
  person: {
    personId: string;
    displayName: string;
    email: string;
    role: string;
    defaultView: string;
    displayCurrency: string;
    pictureUrl: string | null;
    canCreateHousehold: boolean;
  };
  household: {
    householdId: string;
    name: string;
    baseCurrency: string;
    timezone: string;
  } | null;
  csrfToken: string;
  /** Pending invitation details (populated when person has an unaccepted invitation) */
  pendingInvitation: PendingInvitation | null;
  /** True when the person is an owner who was created within the last 2 minutes */
  isFirstLogin: boolean;
}

// --- API Functions ---

/** Fetch current authenticated person + household + CSRF token */
export const fetchMe = (): Promise<AuthMeResponse> =>
  api.get<AuthMeResponse>('/auth/me').then((r) => r.data);

/** Logout — clears the server session */
export const logout = (): Promise<void> =>
  api.post<void>('/auth/logout').then(() => {});

/**
 * Dev bypass login — creates/reuses the fixed dev session.
 * Only available when AUTH_BYPASS_ENABLED=true (single flag controls both backend and frontend).
 * Returns 404 in production (endpoint does not exist).
 *
 * Uses raw fetch (not api.post) to read X-Session-Id from the response and store it in
 * sessionStorage as dev_session_token. Vite's dev proxy strips Set-Cookie headers, so the
 * session must be passed via X-Session-Token header — same mechanism as the OAuth callback
 * hash captured in main.tsx.
 */
export const devLogin = async (): Promise<AuthMeResponse> => {
  const response = await fetch('/auth/dev-login', { method: 'POST' });
  if (!response.ok) {
    throw new Error(`Dev login failed: ${response.status}`);
  }
  const sessionId = response.headers.get('x-session-id');
  if (sessionId) {
    sessionStorage.setItem('dev_session_token', sessionId);
  }
  return response.json() as Promise<AuthMeResponse>;
};
