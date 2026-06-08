/**
 * Authentication state store.
 * Holds current person info, household ID, and CSRF token.
 * Populated from /auth/me on app mount.
 *
 * ARCH §3.2 — Zustand auth store
 */

import { create } from 'zustand';
import type { PendingInvitation } from '../types/auth';

// --- Person Info Shape ---
// Extended with role and pictureUrl from backend /auth/me response (AUTH-001 enrichment)

export interface PersonInfo {
  personId: string;
  displayName: string;
  email: string;
  role: string; // "owner" | "admin" | "member"
  defaultView: 'household' | 'personal';
  displayCurrency: string; // ISO 4217
  pictureUrl: string | null;
  canCreateHousehold: boolean;
}

// --- Auth State ---

interface AuthState {
  currentPerson: PersonInfo | null;
  householdId: string | null;
  householdName: string | null;
  csrfToken: string | null;
  pendingInvitation: PendingInvitation | null;

  /** Set auth state (called after /auth/me or login) */
  setAuth: (person: PersonInfo, householdId: string | null, csrfToken: string, householdName?: string) => void;

  /** Clear all auth state (called on logout or 401) */
  clearAuth: () => void;

  /** Update the current person's default view preference */
  setDefaultView: (view: 'household' | 'personal') => void;

  /** Set pending invitation from /auth/me response */
  setPendingInvitation: (invitation: PendingInvitation | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  currentPerson: null,
  householdId: null,
  householdName: null,
  csrfToken: null,
  pendingInvitation: null,

  setAuth: (person, householdId, csrfToken, householdName) => {
    set({
      currentPerson: person,
      householdId,
      csrfToken,
      householdName: householdName || null,
    });
  },

  clearAuth: () => {
    sessionStorage.removeItem('dev_session_token');
    sessionStorage.removeItem('pendingInviteToken');
    set({
      currentPerson: null,
      householdId: null,
      householdName: null,
      csrfToken: null,
      pendingInvitation: null,
    });
  },

  setDefaultView: (view) => {
    set((state) => ({
      currentPerson: state.currentPerson
        ? { ...state.currentPerson, defaultView: view }
        : null,
    }));
  },

  setPendingInvitation: (invitation) => {
    set({ pendingInvitation: invitation });
  },

}));
