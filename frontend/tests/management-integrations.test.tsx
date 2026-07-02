import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { screen, waitFor, fireEvent, within } from '@testing-library/react'
import { useAuthStore } from '../src/stores/authStore'
import type { Person } from '../src/types/auth'
import type { FxProvider, FxProviderType } from '../src/types/fxProvider'
import { HH, PREFS, makeResponse, renderManagementTab as renderTab } from './fixtures/household'

const OWNER: Person = {
  personId: 'p1', displayName: 'Ben', email: 'ben@example.com', role: 'owner',
  pictureUrl: null, defaultView: 'household', displayCurrency: 'SGD', canCreateHousehold: true,
  theme: 'base', font: 'base', density: 'comfortable', displayFormat: 'DD-MM-YYYY', reduceMotion: false,
  notificationPrefs: PREFS,
}
const ADMIN: Person = { ...OWNER, personId: 'p2', displayName: 'Al', email: 'al@example.com', role: 'admin', canCreateHousehold: false }

const TYPES: FxProviderType[] = [
  { provider_type: 'frankfurter', display_name: 'Frankfurter (ECB)', base_url: 'https://api.frankfurter.dev', requires_key: false },
  { provider_type: 'openexchangerates', display_name: 'Open Exchange Rates', base_url: 'https://openexchangerates.org/api', requires_key: true },
]

const PROVIDERS: FxProvider[] = [
  { id: 'f1', provider_type: 'frankfurter', name: 'Frankfurter (ECB)', base_url: 'https://api.frankfurter.dev', api_key_secret_ref: null, priority: 0, is_enabled: true, last_status: null, last_checked_at: null, requires_key: false, key_configured: false },
  { id: 'o1', provider_type: 'openexchangerates', name: 'Open Exchange Rates', base_url: 'https://openexchangerates.org/api', api_key_secret_ref: 'EXCHANGERATE_API_KEY', priority: 1, is_enabled: false, last_status: null, last_checked_at: null, requires_key: true, key_configured: false },
]

function routeFetch() {
  return vi.fn(async (url: string | URL, opts?: RequestInit) => {
    const u = String(url)
    const method = opts?.method ?? 'GET'
    // Members/invitations the rest of the tab pulls — keep them empty/harmless.
    if (u === '/api/household/members') return makeResponse({ items: [], total: 0 })
    if (u === '/api/household/invitations/manage') return makeResponse({ items: [], total: 0 })
    if (u === '/api/household/invitations') return makeResponse({ items: [], total: 0 })
    if (u === '/api/fx-providers/types') return makeResponse(TYPES)
    if (u === '/api/fx-providers' && method === 'GET') return makeResponse({ items: PROVIDERS, total: 2 })
    if (u === '/api/fx-providers' && method === 'POST') return makeResponse(PROVIDERS[0], 201)
    if (u === '/api/fx-providers/reorder' && method === 'POST') return makeResponse({ items: PROVIDERS, total: 2 })
    if (/\/api\/fx-providers\/[^/]+$/.test(u) && method === 'PATCH') return makeResponse(PROVIDERS[0])
    if (/\/api\/fx-providers\/[^/]+$/.test(u) && method === 'DELETE') return makeResponse(null, 204)
    throw new Error(`unexpected fetch ${u}`)
  })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.restoreAllMocks()
  useAuthStore.getState().clearAuth()
  useAuthStore.setState({ currentPerson: OWNER, household: HH, csrfToken: 'csrf' })
  fetchMock = routeFetch()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  useAuthStore.getState().clearAuth()
})

function patchCalls() {
  return fetchMock.mock.calls.filter(([u, o]) => /\/api\/fx-providers\/[^/]+$/.test(String(u)) && o?.method === 'PATCH')
}

describe('ManagementTab — Integrations (FX providers)', () => {
  test('owner sees provider rows with status chip + key indicator + Add', async () => {
    renderTab()
    // The name doubles as the type label for default-named rows, so query the unique aria-labels.
    expect(await screen.findByLabelText('Enable Frankfurter (ECB)')).toBeTruthy()
    expect(screen.getByLabelText('Enable Open Exchange Rates')).toBeTruthy()
    // Status is "unknown" until 3.7; the key-requiring provider shows "key not set".
    expect(screen.getAllByText('unknown').length).toBe(2)
    expect(screen.getByText('key not set')).toBeTruthy()
    expect(screen.getByText('Add provider')).toBeTruthy()
  })

  test('Add is enabled with an empty form; submitting blocks with the §6 error summary (no POST)', async () => {
    renderTab()
    fireEvent.click(await screen.findByText('Add provider'))
    const dialog = await screen.findByRole('dialog')
    const add = within(dialog).getByRole('button', { name: 'Add' }) as HTMLButtonElement
    expect(add.disabled).toBe(false) // UX §6 — never disabled for missing input
    fireEvent.click(add)
    // Blocked: the error-summary Zone renders and nothing is POSTed (a required field is empty).
    expect(within(dialog).getByTestId('entity-modal-error-summary')).toBeTruthy()
    expect(
      fetchMock.mock.calls.some(([u, o]) => String(u) === '/api/fx-providers' && o?.method === 'POST'),
    ).toBe(false)
  })

  test('non-owner (admin) sees read-only roster: no Add, no toggle, no ⋮', async () => {
    useAuthStore.setState({ currentPerson: ADMIN })
    renderTab()
    expect((await screen.findAllByText('Frankfurter (ECB)')).length).toBeGreaterThan(0)
    expect(screen.queryByText('Add provider')).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByLabelText(/Actions for/)).toBeNull()
    // Enabled state is shown as a static badge instead.
    expect(screen.getByText('enabled')).toBeTruthy()
    expect(screen.getByText('disabled')).toBeTruthy()
  })

  test('toggling enable PATCHes is_enabled', async () => {
    renderTab()
    const toggle = await screen.findByLabelText('Enable Frankfurter (ECB)')
    fireEvent.click(toggle)
    await waitFor(() => expect(patchCalls().length).toBe(1))
    expect(JSON.parse(patchCalls()[0][1].body as string)).toEqual({ is_enabled: false })
  })

  test('Add modal: secret-ref field appears only for key-requiring types; POST omits raw key', async () => {
    renderTab()
    fireEvent.click(await screen.findByText('Add provider'))

    const dialog = await screen.findByRole('dialog')
    // No raw "API key" field exists — only a secret REFERENCE, and only after picking a key type.
    expect(within(dialog).queryByLabelText('API key secret reference')).toBeNull()

    // Pick the keyless Frankfurter → still no secret-ref field. (The Dropdown trigger lives in the
    // dialog; its option list is PORTALLED to the body, so options are scoped to the `listbox` panel —
    // not the dialog, and not `screen` which would also match the provider rows behind the modal.)
    fireEvent.click(within(dialog).getByText('Select a provider'))
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Frankfurter (ECB)'))
    expect(within(dialog).queryByLabelText('API key secret reference')).toBeNull()

    // Switch to the key-requiring type → the secret-reference field appears. Reopen via the trigger
    // (the only "Frankfurter (ECB)" inside the dialog while the portalled panel is closed).
    fireEvent.click(within(dialog).getByText('Frankfurter (ECB)'))
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Open Exchange Rates'))
    expect(within(dialog).getByLabelText('API key secret reference')).toBeTruthy()

    fireEvent.click(within(dialog).getByText('Add'))
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u, o]) => String(u) === '/api/fx-providers' && o?.method === 'POST')).toBe(true),
    )
    const post = fetchMock.mock.calls.find(([u, o]) => String(u) === '/api/fx-providers' && o?.method === 'POST')!
    const body = JSON.parse(post[1].body as string)
    expect(body.provider_type).toBe('openexchangerates')
    expect('api_key' in body).toBe(false) // never a raw key
  })

  test('Move down reorders via POST /reorder with swapped ids', async () => {
    renderTab()
    fireEvent.click(await screen.findByLabelText('Actions for Frankfurter (ECB)'))
    fireEvent.click(await screen.findByText('Move down'))
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/fx-providers/reorder')).toBe(true),
    )
    const call = fetchMock.mock.calls.find(([u]) => String(u) === '/api/fx-providers/reorder')!
    expect(JSON.parse(call[1].body as string)).toEqual({ ordered_ids: ['o1', 'f1'] })
  })

  test('Remove opens the confirm dialog then DELETEs', async () => {
    renderTab()
    fireEvent.click(await screen.findByLabelText('Actions for Open Exchange Rates'))
    fireEvent.click(await screen.findByText('Remove'))
    // ConfirmationDialog confirm button.
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByText('Remove'))
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u, o]) => /\/api\/fx-providers\/o1$/.test(String(u)) && o?.method === 'DELETE')).toBe(true),
    )
  })

  test('Bank connections placeholder is present and disabled (Coming soon)', async () => {
    renderTab()
    await screen.findByText('Add provider')
    expect(screen.getByText('Bank connections')).toBeTruthy()
    expect(screen.getByText('Coming soon')).toBeTruthy()
    expect((screen.getByText('Connect') as HTMLButtonElement).disabled).toBe(true)
  })
})
