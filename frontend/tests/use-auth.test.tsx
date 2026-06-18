import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useAuth } from '../src/hooks/useAuth'
import { useAuthStore } from '../src/stores/authStore'
import type { AuthMe } from '../src/types/auth'

function makeResponse(body: unknown, status = 200) {
  return new Response(body !== null ? JSON.stringify(body) : null, {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Fresh QueryClient per test (no retries so error states resolve immediately). */
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

const PAYLOAD: AuthMe = {
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
  household: { householdId: 'h1', name: 'HH', baseCurrency: 'SGD', timezone: 'Asia/Singapore' },
  csrfToken: 'csrf-1',
  pendingInvitation: null,
  isFirstLogin: false,
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.restoreAllMocks()
  useAuthStore.getState().clearAuth()
  sessionStorage.removeItem('dev_session_token')
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  useAuthStore.getState().clearAuth()
})

describe('useAuth — bootstrap', () => {
  test('fetches /auth/me once, feeds setAuth, toggles isLoading', async () => {
    fetchMock.mockResolvedValue(makeResponse(PAYLOAD))
    const { result } = renderHook(() => useAuth(), { wrapper: wrapper() })

    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]![0])).toBe('/auth/me')
    expect(useAuthStore.getState().currentPerson?.personId).toBe('p1')
    expect(useAuthStore.getState().csrfToken).toBe('csrf-1')
    expect(result.current.authError).toBeNull()
  })

  test('sets authError on a non-401 failure (5xx)', async () => {
    fetchMock.mockResolvedValue(makeResponse({ type: 'server_error', title: 'Boom' }, 500))
    const { result } = renderHook(() => useAuth(), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.authError).not.toBeNull())
    expect(result.current.isLoading).toBe(false)
    expect(useAuthStore.getState().currentPerson).toBeNull()
  })
})
