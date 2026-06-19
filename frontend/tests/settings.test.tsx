import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Settings } from '../src/pages/Settings'
import { useAuthStore } from '../src/stores/authStore'
import { useThemeStore } from '../src/stores/themeStore'
import type { Household, NotificationPrefs, Person } from '../src/types/auth'

const PREFS: NotificationPrefs = {
  budgetWarnings: true, budgetOverruns: true, missedRecurring: true,
  upcomingPayments: false, fxStale: true, backups: false,
}
const HH: Household = { householdId: 'h1', name: "Ben's Household", baseCurrency: 'SGD', timezone: 'Asia/Singapore' }
const OWNER: Person = {
  personId: 'p1', displayName: 'Ben', email: 'ben@example.com', role: 'owner',
  pictureUrl: null, defaultView: 'household', displayCurrency: 'SGD', canCreateHousehold: true,
  theme: 'base', font: 'base', density: 'comfortable', displayFormat: 'DD-MM-YYYY', reduceMotion: false, notificationPrefs: PREFS,
}

function makeResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
  return render(<Settings />, { wrapper })
}

beforeEach(() => {
  vi.restoreAllMocks()
  useAuthStore.getState().clearAuth()
  useAuthStore.setState({ currentPerson: OWNER, household: HH })
  useThemeStore.setState({ theme: 'base', font: 'base', density: 'comfortable', reduceMotion: false })
  // Management tab fires the two list queries on mount — keep them satisfied.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({ items: [], total: 0 })))
})

afterEach(() => {
  vi.unstubAllGlobals()
  useAuthStore.getState().clearAuth()
})

describe('Settings page', () => {
  test('renders the three tabs', () => {
    renderSettings()
    expect(screen.getByText('Profile')).toBeTruthy()
    expect(screen.getByText('Management')).toBeTruthy()
    expect(screen.getByText('Data')).toBeTruthy()
  })

  test('Profile is the default tab (identity controls visible)', () => {
    renderSettings()
    expect(screen.getByText('Identity')).toBeTruthy()
    expect(screen.getByLabelText('Display name')).toBeTruthy()
    // Management content is not rendered until its tab is selected.
    expect(screen.queryByLabelText('Household name')).toBeNull()
  })

  test('Management tab renders household config when selected', () => {
    renderSettings()
    fireEvent.click(screen.getByText('Management'))
    expect(screen.getByText('Household')).toBeTruthy()
    expect(screen.getByLabelText('Household name')).toBeTruthy()
  })

  test('Data tab shows a placeholder', () => {
    renderSettings()
    fireEvent.click(screen.getByText('Data'))
    expect(screen.getByText('Coming soon')).toBeTruthy()
  })
})
