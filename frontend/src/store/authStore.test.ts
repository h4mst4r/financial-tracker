/**
 * Tests for authStore — Zustand authentication state management.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuthStore } from './authStore';
import type { PersonInfo } from './authStore';

// --- Test Data ---

const mockPerson: PersonInfo = {
  personId: 'person-uuid-1',
  displayName: 'Test User',
  email: 'test@example.com',
  defaultView: 'household',
  displayCurrency: 'SGD',
};

const mockHouseholdId = 'household-uuid-1';
const mockCsrfToken = 'csrf-token-abc123';

// --- Tests ---

describe('useAuthStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useAuthStore.getState().clearAuth();
  });

  describe('initial state', () => {
    it('has null currentPerson', () => {
      expect(useAuthStore.getState().currentPerson).toBeNull();
    });

    it('has null householdId', () => {
      expect(useAuthStore.getState().householdId).toBeNull();
    });

    it('has null csrfToken', () => {
      expect(useAuthStore.getState().csrfToken).toBeNull();
    });
  });

  describe('setAuth', () => {
    it('sets currentPerson', () => {
      useAuthStore.getState().setAuth(mockPerson, mockHouseholdId, mockCsrfToken);

      expect(useAuthStore.getState().currentPerson).toEqual(mockPerson);
    });

    it('sets householdId', () => {
      useAuthStore.getState().setAuth(mockPerson, mockHouseholdId, mockCsrfToken);

      expect(useAuthStore.getState().householdId).toBe(mockHouseholdId);
    });

    it('sets csrfToken', () => {
      useAuthStore.getState().setAuth(mockPerson, mockHouseholdId, mockCsrfToken);

      expect(useAuthStore.getState().csrfToken).toBe(mockCsrfToken);
    });

    it('sets all fields simultaneously', () => {
      useAuthStore.getState().setAuth(mockPerson, mockHouseholdId, mockCsrfToken);

      const state = useAuthStore.getState();
      expect(state.currentPerson).not.toBeNull();
      expect(state.householdId).not.toBeNull();
      expect(state.csrfToken).not.toBeNull();
    });

    it('overwrites existing auth state', () => {
      // Set initial state
      useAuthStore.getState().setAuth(mockPerson, mockHouseholdId, mockCsrfToken);

      // Set new state
      const newPerson: PersonInfo = {
        personId: 'person-uuid-2',
        displayName: 'New User',
        email: 'new@example.com',
        defaultView: 'personal',
        displayCurrency: 'USD',
      };
      useAuthStore.getState().setAuth(newPerson, 'new-household', 'new-token');

      const state = useAuthStore.getState();
      expect(state.currentPerson?.personId).toBe('person-uuid-2');
      expect(state.householdId).toBe('new-household');
      expect(state.csrfToken).toBe('new-token');
    });
  });

  describe('clearAuth', () => {
    it('resets currentPerson to null', () => {
      useAuthStore.getState().setAuth(mockPerson, mockHouseholdId, mockCsrfToken);
      useAuthStore.getState().clearAuth();

      expect(useAuthStore.getState().currentPerson).toBeNull();
    });

    it('resets householdId to null', () => {
      useAuthStore.getState().setAuth(mockPerson, mockHouseholdId, mockCsrfToken);
      useAuthStore.getState().clearAuth();

      expect(useAuthStore.getState().householdId).toBeNull();
    });

    it('resets csrfToken to null', () => {
      useAuthStore.getState().setAuth(mockPerson, mockHouseholdId, mockCsrfToken);
      useAuthStore.getState().clearAuth();

      expect(useAuthStore.getState().csrfToken).toBeNull();
    });

    it('can be called when already cleared (no-op)', () => {
      useAuthStore.getState().clearAuth();
      // Should not throw
      useAuthStore.getState().clearAuth();

      const state = useAuthStore.getState();
      expect(state.currentPerson).toBeNull();
      expect(state.householdId).toBeNull();
      expect(state.csrfToken).toBeNull();
    });
  });

  describe('PersonInfo shape', () => {
    it('contains all required fields', () => {
      const person: PersonInfo = {
        personId: 'test-id',
        displayName: 'Test',
        email: 'test@test.com',
        defaultView: 'personal',
        displayCurrency: 'USD',
      };

      expect(person.personId).toBeDefined();
      expect(person.displayName).toBeDefined();
      expect(person.email).toBeDefined();
      expect(person.defaultView).toBeDefined();
      expect(person.displayCurrency).toBeDefined();
    });

    it('supports household default view', () => {
      const person: PersonInfo = {
        personId: 'test-id',
        displayName: 'Test',
        email: 'test@test.com',
        defaultView: 'household',
        displayCurrency: 'USD',
      };

      expect(person.defaultView).toBe('household');
    });
  });

  describe('reactivity', () => {
    it('updates subscribers when setAuth is called', () => {
      const listener = vi.fn();
      const unsubscribe = useAuthStore.subscribe(listener);

      useAuthStore.getState().setAuth(mockPerson, mockHouseholdId, mockCsrfToken);

      expect(listener).toHaveBeenCalled();
      unsubscribe();
    });

    it('updates subscribers when clearAuth is called', () => {
      // Set some state first
      useAuthStore.getState().setAuth(mockPerson, mockHouseholdId, mockCsrfToken);

      const listener = vi.fn();
      const unsubscribe = useAuthStore.subscribe(listener);

      useAuthStore.getState().clearAuth();

      expect(listener).toHaveBeenCalled();
      unsubscribe();
    });
  });
});
