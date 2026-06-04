/**
 * Thin API wrapper for auth endpoints.
 * Uses the base api client which handles CSRF injection and 401 → clearAuth automatically.
 *
 * AUTH-003 — Auth frontend
 */

import { api } from './client';

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
  };
  household: {
    householdId: string;
    name: string;
    baseCurrency: string;
    timezone: string;
  };
  csrfToken: string;
  /** Set when the person joined via invitation but hasn't explicitly accepted yet */
  pendingInvitationToken: string | null;
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
