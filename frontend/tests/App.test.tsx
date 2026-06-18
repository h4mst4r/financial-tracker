import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from '../src/App'
import { useAuthStore } from '../src/stores/authStore'
import type { AuthMe } from '../src/types/auth'

function makeResponse(body: unknown, status = 200) {
  return new Response(body !== null ? JSON.stringify(body) : null, {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const IN_HOUSEHOLD: AuthMe = {
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

function renderApp(initialPath = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.restoreAllMocks()
  // restoreAllMocks resets the matchMedia stub from setup.ts; App → useAppearance needs it.
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
  useAuthStore.getState().clearAuth()
  sessionStorage.removeItem('dev_session_token')
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  useAuthStore.getState().clearAuth()
})

test('shows the loading spinner while /auth/me is pending', () => {
  fetchMock.mockReturnValue(new Promise(() => {})) // never resolves
  renderApp()
  expect(screen.getByRole('status')).toBeInTheDocument()
})

test('renders the app root for an in-household session', async () => {
  fetchMock.mockResolvedValue(makeResponse(IN_HOUSEHOLD))
  renderApp()
  expect(await screen.findByRole('heading', { name: 'Financial Tracker' })).toBeInTheDocument()
})

test('renders the neutral shell (no app heading) for a NULL-household session', async () => {
  fetchMock.mockResolvedValue(makeResponse({ ...IN_HOUSEHOLD, household: null }))
  renderApp()
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  expect(screen.queryByRole('heading', { name: 'Financial Tracker' })).not.toBeInTheDocument()
})

test('renders the /login placeholder for the login route', () => {
  fetchMock.mockReturnValue(new Promise(() => {}))
  renderApp('/login')
  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
})
