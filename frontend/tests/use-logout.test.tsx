import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useLogout } from '../src/hooks/useLogout'
import { useAuthStore } from '../src/stores/authStore'
import type { AuthMe } from '../src/types/auth'

function makeResponse(body: unknown, status = 200) {
  return new Response(body !== null ? JSON.stringify(body) : null, {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

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
  household: { householdId: 'h1', name: 'HH', baseCurrency: 'SGD', timezone: 'Asia/Singapore' },
  csrfToken: 'csrf-1',
  pendingInvitation: null,
  isFirstLogin: false,
}

function Harness() {
  const { logout, isPending } = useLogout()
  const loc = useLocation()
  return (
    <>
      <button onClick={logout} disabled={isPending}>
        sign out
      </button>
      <span data-testid="path">{loc.pathname}</span>
    </>
  )
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  useAuthStore.getState().setAuth(ME)
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  useAuthStore.getState().clearAuth()
})

test('logout POSTs /auth/logout, clears auth, and navigates to /login', async () => {
  fetchMock.mockResolvedValue(makeResponse(null, 204))
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Harness />
      </MemoryRouter>
    </QueryClientProvider>,
  )

  expect(screen.getByTestId('path')).toHaveTextContent('/dashboard')
  fireEvent.click(screen.getByRole('button', { name: 'sign out' }))

  await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/login'))

  const [endpoint, init] = fetchMock.mock.calls[0]
  expect(endpoint).toBe('/auth/logout')
  expect(init.method).toBe('POST')
  expect(useAuthStore.getState().currentPerson).toBeNull()
})
