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
    theme: 'base', font: 'base', density: 'comfortable', reduceMotion: false,
    notificationPrefs: { budgetWarnings: true, budgetOverruns: true, missedRecurring: true, upcomingPayments: false, fxStale: true, backups: false },
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

test('renders the app inside the AppShell for an in-household session', async () => {
  fetchMock.mockResolvedValue(makeResponse(IN_HOUSEHOLD))
  renderApp()
  expect(await screen.findByTestId('app-shell')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Financial Tracker' })).toBeInTheDocument()
})

test('shows the HouseholdConflictDialog over the shell for an in-household cross-household invite', async () => {
  // Story 2.6c: /auth/me now returns a pendingInvitation alongside a non-null household.
  fetchMock.mockResolvedValue(
    makeResponse({
      ...IN_HOUSEHOLD,
      pendingInvitation: {
        token: 'tok',
        householdId: 'h2',
        householdName: 'Acme',
        invitedByDisplayName: 'Ada',
        invitedEmail: 'pat@example.com',
        expiresAt: '2026-06-25',
        status: 'pending',
      },
    }),
  )
  renderApp()
  // The shell still renders; the conflict dialog (owner variant) overlays it at the app root.
  expect(await screen.findByTestId('app-shell')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Already own a household' })).toBeInTheDocument()
})

test('renders the neutral shell (no AppShell) for a NULL-household session', async () => {
  fetchMock.mockResolvedValue(makeResponse({ ...IN_HOUSEHOLD, household: null }))
  renderApp()
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  expect(screen.queryByTestId('app-shell')).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Financial Tracker' })).not.toBeInTheDocument()
})

test('renders the real Login page at /login', () => {
  fetchMock.mockReturnValue(new Promise(() => {})) // /auth/me pending; /login renders ungated
  renderApp('/login')
  expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
})

test('shows Refused Connection on /login when the bootstrap fails (non-401)', async () => {
  fetchMock.mockRejectedValue(new TypeError('network down'))
  renderApp('/login')
  expect(await screen.findByRole('heading', { name: 'Refused connection' })).toBeInTheDocument()
})

test.each([
  ['not_invited', 'Not invited'],
  ['removed', 'Removed from household'],
  ['household_deleted', 'Household deleted'],
  ['account_archived', 'Account suspended'],
])('routes /login?error=%s to its public page', (code, heading) => {
  fetchMock.mockReturnValue(new Promise(() => {}))
  renderApp(`/login?error=${code}`)
  expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
})

test('routes /login?error=oauth_error to Login with the error banner', () => {
  fetchMock.mockReturnValue(new Promise(() => {}))
  renderApp('/login?error=oauth_error')
  expect(screen.getByText(/Sign-in failed/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
})

test('renders Not Found for an unmatched in-household path', async () => {
  fetchMock.mockResolvedValue(makeResponse(IN_HOUSEHOLD))
  renderApp('/bogus')
  expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument()
})
