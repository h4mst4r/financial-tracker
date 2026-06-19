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
  fetchMock = vi.fn().mockResolvedValue(makeResponse(PERSON))
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

  test('display currency is read-only and there is no colour control (P0)', () => {
    renderProfile()
    expect(screen.getByLabelText('Display currency').hasAttribute('readonly')).toBe(true)
    expect(screen.queryByLabelText(/colour/i)).toBeNull()
  })

  test('picking a date format persists it (no themeStore — read from currentPerson)', async () => {
    const updated = { ...PERSON, displayFormat: 'MM-DD-YYYY' as const }
    fetchMock.mockResolvedValue(makeResponse(updated))
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
    fetchMock.mockResolvedValue(makeResponse(updated))
    renderProfile()

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Benjamin' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(String(fetchMock.mock.calls[0]![0])).toBe('/api/profile')
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
