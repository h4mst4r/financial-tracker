import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ProfileTab } from '../src/components/settings/ProfileTab'
import { useAuthStore } from '../src/stores/authStore'
import { useThemeStore } from '../src/stores/themeStore'
import type { NotificationPrefs, Person } from '../src/types/auth'

const PREFS: NotificationPrefs = {
  budgetWarnings: true, budgetOverruns: true, missedRecurring: true,
  upcomingPayments: false, fxStale: true, backups: false,
}
const PERSON: Person = {
  personId: 'p1', displayName: 'Ben', email: 'ben@example.com', role: 'member',
  pictureUrl: null, defaultView: 'household', displayCurrency: 'SGD', canCreateHousehold: false,
  theme: 'base', font: 'base', density: 'comfortable', displayFormat: 'DD-MM-YYYY',
  reduceMotion: false, notificationPrefs: PREFS,
}

// SGD + NZD are display-active; EUR is not (must be excluded from the picker).
const CURRENCIES = {
  items: [
    { code: 'SGD', symbol: 'S$', is_display_active: true },
    { code: 'NZD', symbol: 'NZ$', is_display_active: true },
    { code: 'EUR', symbol: '€', is_display_active: false },
  ],
  total: 3,
}

function makeResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

let fetchMock: ReturnType<typeof vi.fn>

function renderProfile() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(<ProfileTab />, { wrapper })
}

/** The PATCH body the component sent (parsed). */
function lastPatchBody() {
  const call = fetchMock.mock.calls.at(-1)!
  return JSON.parse((call[1] as RequestInit).body as string)
}

beforeEach(() => {
  vi.restoreAllMocks()
  useAuthStore.getState().clearAuth()
  useAuthStore.setState({ currentPerson: PERSON, csrfToken: 'csrf-1' })
  useThemeStore.setState({ theme: 'base', font: 'base', density: 'comfortable', reduceMotion: false })
  // URL-aware: the GET /api/currencies feeds the display-currency picker; everything else → PERSON.
  fetchMock = vi.fn((url: unknown) =>
    Promise.resolve(
      String(url).includes('/api/currencies') ? makeResponse(CURRENCIES) : makeResponse(PERSON),
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  useAuthStore.getState().clearAuth()
})

describe('ProfileTab', () => {
  test('renders the four §5.1 sections', () => {
    renderProfile()
    expect(screen.getByText('Identity')).toBeTruthy()
    expect(screen.getByText('Appearance')).toBeTruthy()
    expect(screen.getByText('Notifications')).toBeTruthy()
    expect(screen.getByText('App')).toBeTruthy()
  })

  test('no colour control in Identity (P0)', () => {
    renderProfile()
    expect(screen.queryByLabelText(/colour/i)).toBeNull()
  })

  test('display currency is a picker of display-active currencies (Story 3.9)', async () => {
    renderProfile()
    // The trigger's accessible name is its <Label> ("Display currency"); pre-set to SGD.
    const trigger = await screen.findByRole('button', { name: 'Display currency' })
    fireEvent.click(trigger)
    // Native (Story 4.9) is offered first, then NZD (display-active); EUR is not → excluded.
    expect(screen.getByRole('option', { name: 'Native' })).toBeTruthy()
    // NZD is an async (query-loaded) option — await it so the assertion doesn't race the fetch.
    expect(await screen.findByRole('option', { name: 'NZD (NZ$)' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: '€' })).toBeNull()
  })

  test('picking a display currency persists it', async () => {
    fetchMock.mockImplementation((url: unknown) =>
      Promise.resolve(
        String(url).includes('/api/currencies')
          ? makeResponse(CURRENCIES)
          : makeResponse({ ...PERSON, displayCurrency: 'NZD' }),
      ),
    )
    renderProfile()
    fireEvent.click(await screen.findByRole('button', { name: 'Display currency' }))
    fireEvent.click(await screen.findByRole('option', { name: 'NZD (NZ$)' }))

    await waitFor(() => expect(lastPatchBody()).toEqual({ displayCurrency: 'NZD' }))
    await waitFor(() =>
      expect(useAuthStore.getState().currentPerson?.displayCurrency).toBe('NZD'),
    )
  })

  test('picking a date format persists it (no themeStore — read from currentPerson)', async () => {
    const updated = { ...PERSON, displayFormat: 'MM-DD-YYYY' as const }
    // mockImplementation (not mockResolvedValue) so each fetch gets a FRESH Response — the
    // mount-time GET /api/currencies must not drain the body the PATCH then reads.
    fetchMock.mockImplementation((url: unknown) =>
      Promise.resolve(
        String(url).includes('/api/currencies') ? makeResponse(CURRENCIES) : makeResponse(updated),
      ),
    )
    renderProfile()
    // The trigger's accessible name is its associated <Label> ("Date format").
    fireEvent.click(screen.getByRole('button', { name: 'Date format' }))
    fireEvent.click(screen.getByRole('option', { name: 'MM-DD-YYYY' }))

    await waitFor(() => expect(lastPatchBody()).toEqual({ displayFormat: 'MM-DD-YYYY' }))
    await waitFor(() =>
      expect(useAuthStore.getState().currentPerson?.displayFormat).toBe('MM-DD-YYYY'),
    )
  })

  test('display name Save sends PATCH and updates the store + toast', async () => {
    const updated = { ...PERSON, displayName: 'Benjamin' }
    fetchMock.mockImplementation((url: unknown) =>
      Promise.resolve(
        String(url).includes('/api/currencies') ? makeResponse(CURRENCIES) : makeResponse(updated),
      ),
    )
    renderProfile()

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Benjamin' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/profile')).toBe(true),
    )
    expect(lastPatchBody()).toEqual({ displayName: 'Benjamin' })
    await waitFor(() => expect(useAuthStore.getState().currentPerson?.displayName).toBe('Benjamin'))
  })

  test('picking a theme applies live (themeStore) and persists', async () => {
    renderProfile()
    // The trigger's accessible name is its associated <Label> ("Theme"), not its content.
    fireEvent.click(screen.getByRole('button', { name: 'Theme' }))
    fireEvent.click(screen.getByRole('option', { name: /retro 70s/i }))

    expect(useThemeStore.getState().theme).toBe('retro') // live
    await waitFor(() => expect(lastPatchBody()).toEqual({ theme: 'retro' })) // persisted
  })

  test('toggling density applies live and persists', async () => {
    renderProfile()
    fireEvent.click(screen.getByLabelText('Compact density'))
    expect(useThemeStore.getState().density).toBe('compact')
    await waitFor(() => expect(lastPatchBody()).toEqual({ density: 'compact' }))
  })

  test('toggling reduce motion applies live and persists', async () => {
    renderProfile()
    fireEvent.click(screen.getByLabelText('Reduce motion'))
    expect(useThemeStore.getState().reduceMotion).toBe(true)
    await waitFor(() => expect(lastPatchBody()).toEqual({ reduceMotion: true }))
  })

  test('toggling a notification persists only the changed key (backend merges)', async () => {
    renderProfile()
    // "Backups" starts off; toggling it on sends only { backups: true } (avoids the lost-update race).
    fireEvent.click(screen.getByLabelText('Backups'))
    await waitFor(() => expect(lastPatchBody()).toEqual({ notificationPrefs: { backups: true } }))
  })
})
