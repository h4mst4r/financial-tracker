/**
 * Authentication state store.
 * Holds current person info, household ID, and CSRF token.
 * Populated from /auth/me on app mount.
 *
 * ARCH §3.2 — Zustand auth store
 */

import { create } from 'zustand';

// --- Person Info Shape ---

export interface PersonInfo {
  personId: string;
  displayName: string;
  email: string;
  defaultView: 'household' | 'personal';
  displayCurrency: string; // ISO 4217
}

// --- Auth State ---

interface AuthState {
  currentPerson: PersonInfo | null;
  householdId: string | null;
  csrfToken: string | null;

  /** Set auth state (called after /auth/me or login) */
  setAuth: (person: PersonInfo, householdId: string, csrfToken: string) => void;

  /** Clear all auth state (called on logout or 401) */
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  currentPerson: null,
  householdId: null,
  csrfToken: null,

  setAuth: (person, householdId, csrfToken) => {
    set({
      currentPerson: person,
      householdId,
      csrfToken,
    });
  },

  clearAuth: () => {
    set({
      currentPerson: null,
      householdId: null,
      csrfToken: null,
    });
  },
}));
