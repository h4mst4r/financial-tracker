import { afterEach, describe, expect, test } from 'vitest'
import { useAuthStore } from '../src/stores/authStore'
import type { AuthMe, Household } from '../src/types/auth'

const HH: Household = { householdId: 'h1', name: 'HH', baseCurrency: 'SGD', timezone: 'Asia/Singapore' }
const ME: AuthMe = {
  person: {
    personId: 'p1',
    displayName: 'Pat',
    email: 'pat@example.com',
    role: 'owner',
    pictureUrl: null,
    defaultView: 'household',
    displayCurrency: 'SGD',
    canCreateHousehold: true,
  },
  household: HH,
  csrfToken: 'c1',
  pendingInvitation: null,
  isFirstLogin: true,
}

afterEach(() => useAuthStore.getState().clearAuth())

describe('authStore — first-login (Story 2.4c)', () => {
  test('setAuth maps isFirstLogin from the payload', () => {
    useAuthStore.getState().setAuth(ME)
    expect(useAuthStore.getState().isFirstLogin).toBe(true)
  })

  test('dismissFirstLogin clears the flag only', () => {
    useAuthStore.setState({ household: HH, isFirstLogin: true })
    useAuthStore.getState().dismissFirstLogin()
    expect(useAuthStore.getState().isFirstLogin).toBe(false)
    expect(useAuthStore.getState().household).toEqual(HH)
  })

  test('setHousehold replaces the household', () => {
    useAuthStore.getState().setHousehold({ ...HH, name: 'Renamed' })
    expect(useAuthStore.getState().household?.name).toBe('Renamed')
  })

  test('clearAuth resets isFirstLogin', () => {
    useAuthStore.setState({ isFirstLogin: true })
    useAuthStore.getState().clearAuth()
    expect(useAuthStore.getState().isFirstLogin).toBe(false)
  })
})
