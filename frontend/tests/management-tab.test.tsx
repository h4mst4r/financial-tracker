import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ManagementTab } from '../src/components/settings/ManagementTab'
import { useAuthStore } from '../src/stores/authStore'
import type { Household, Person } from '../src/types/auth'
import type { Invitation, ListResponse, Member } from '../src/types/household'

const HH: Household = { householdId: 'h1', name: "Ben's Household", baseCurrency: 'SGD', timezone: 'Asia/Singapore' }
const OWNER: Person = {
  personId: 'p1', displayName: 'Ben', email: 'ben@example.com', role: 'owner',
  pictureUrl: null, defaultView: 'household', displayCurrency: 'SGD', canCreateHousehold: true,
  theme: 'base', font: 'base', density: 'comfortable', displayFormat: 'DD-MM-YYYY', reduceMotion: false,
  notificationPrefs: { budgetWarnings: true, budgetOverruns: true, missedRecurring: true, upcomingPayments: false, fxStale: true, backups: false },
}
const MEMBER: Person = { ...OWNER, personId: 'p2', displayName: 'Mem', email: 'mem@example.com', role: 'member', canCreateHousehold: false }

const MEMBERS: ListResponse<Member> = {
  items: [
    { personId: 'p1', displayName: 'Ben Lim', email: 'ben@example.com', role: 'owner', pictureUrl: null, colour: '#6366f1', status: 'active', canDelete: false },
    { personId: 'p2', displayName: 'Alex Lim', email: 'alex@example.com', role: 'admin', pictureUrl: null, colour: null, status: 'active', canDelete: false },
  ],
  total: 2,
}

function makeResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** Route fetch by URL so the list queries + the PATCH each get the right body. The owner/admin path
 *  reads the token-bearing `…/invitations/manage`; a plain member reads `…/invitations` (Story 2.6b). */
// SGD (base) + NZD for the base-currency picker (Story 3.9).
const CURRENCIES = {
  items: [
    { code: 'SGD', symbol: 'S$', is_base: true, is_display_active: true },
    { code: 'NZD', symbol: 'NZ$', is_base: false, is_display_active: true },
  ],
  total: 2,
}

function routeFetch(overrides: { members?: ListResponse<Member>; invitations?: ListResponse<Invitation>; manage?: ListResponse<unknown>; patch?: Household } = {}) {
  const members = overrides.members ?? MEMBERS
  const invitations = overrides.invitations ?? { items: [], total: 0 }
  const manage = overrides.manage ?? { items: [], total: 0 }
  return vi.fn(async (url: string | URL, opts?: RequestInit) => {
    const u = String(url)
    if (u === '/api/household' && opts?.method === 'PATCH') {
      return makeResponse(overrides.patch ?? { ...HH, name: 'Renamed' })
    }
    if (u === '/api/household/base-currency') return makeResponse({ ...HH, baseCurrency: 'NZD' })
    if (u === '/api/household/members') return makeResponse(members)
    if (u === '/api/household/invitations/manage') return makeResponse(manage)
    if (u === '/api/household/invitations') return makeResponse(invitations)
    if (u === '/api/currencies') return makeResponse(CURRENCIES)
    if (u === '/api/fx-providers/types') return makeResponse([])
    if (u === '/api/fx-providers') return makeResponse({ items: [], total: 0 })
    throw new Error(`unexpected fetch ${u}`)
  })
}

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
  return render(<ManagementTab />, { wrapper })
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

describe('ManagementTab — household config', () => {
  test('owner can edit name/timezone; Save PATCHes and updates the store', async () => {
    renderTab()
    const nameInput = screen.getByLabelText('Household name') as HTMLInputElement
    expect(nameInput.disabled).toBe(false)

    fireEvent.change(nameInput, { target: { value: 'The Lim Household' } })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u, o]) => String(u) === '/api/household' && o?.method === 'PATCH')).toBe(true),
    )
    const patchCall = fetchMock.mock.calls.find(([u, o]) => String(u) === '/api/household' && o?.method === 'PATCH')!
    expect(JSON.parse(patchCall[1].body as string)).toEqual({ name: 'The Lim Household', timezone: 'Asia/Singapore' })
    await waitFor(() => expect(useAuthStore.getState().household?.name).toBe('Renamed'))
  })

  test('non-owner sees config disabled with no Save', async () => {
    useAuthStore.setState({ currentPerson: MEMBER })
    renderTab()
    expect((screen.getByLabelText('Household name') as HTMLInputElement).disabled).toBe(true)
    expect(screen.queryByText('Save')).toBeNull()
    // Both the household config and the Integrations panel show an "Owner only" indicator now.
    expect(screen.getAllByText('Owner only').length).toBeGreaterThan(0)
  })

  test('non-owner base currency is read-only; no date-format field (P0)', () => {
    useAuthStore.setState({ currentPerson: MEMBER })
    renderTab()
    const baseCcy = screen.getByLabelText('Base currency') as HTMLInputElement
    expect(baseCcy.value).toBe('SGD')
    expect(baseCcy.readOnly).toBe(true)
    expect(screen.queryByText(/date format/i)).toBeNull()
  })

  test('owner picks a new base currency → recompute confirm → POST + store update (Story 3.9)', async () => {
    renderTab()
    // Owner gets a picker (button), not a read-only input; pre-set to SGD.
    const trigger = await screen.findByRole('button', { name: 'Base currency' })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('option', { name: 'NZD (NZ$)' }))

    // The recompute-warning confirm appears; nothing is POSTed until confirmed.
    expect(screen.getByText(/recomputes all amounts/i)).toBeTruthy()
    expect(
      fetchMock.mock.calls.some(([u]) => String(u) === '/api/household/base-currency'),
    ).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Change base currency' }))
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([u]) => String(u) === '/api/household/base-currency'),
      ).toBe(true),
    )
    const call = fetchMock.mock.calls.find(([u]) => String(u) === '/api/household/base-currency')!
    expect(JSON.parse(call[1].body as string)).toEqual({ baseCurrency: 'NZD' })
    await waitFor(() => expect(useAuthStore.getState().household?.baseCurrency).toBe('NZD'))
  })
})

describe('ManagementTab — lists', () => {
  test('members list renders rows; no ⋮ menu (P0)', async () => {
    renderTab()
    expect(await screen.findByText('Ben Lim')).toBeTruthy()
    expect(screen.getByText('Alex Lim')).toBeTruthy()
    expect(screen.getByText('alex@example.com')).toBeTruthy()
    expect(screen.getByText('owner')).toBeTruthy()
    expect(screen.getByText('admin')).toBeTruthy()
    expect(screen.queryByText('⋮')).toBeNull()
  })

  test('invitations empty → EmptyState', async () => {
    renderTab()
    expect(await screen.findByText('No invitations yet')).toBeTruthy()
  })

  test('member sees read-only invitations: rows with status + expiry, no actions (2.5 path)', async () => {
    useAuthStore.setState({ currentPerson: MEMBER })
    fetchMock = routeFetch({
      invitations: {
        items: [{ invitedEmail: 'cara@example.com', status: 'pending', expiresAt: '2026-06-25', createdAt: '2026-06-18' }],
        total: 1,
      },
    })
    vi.stubGlobal('fetch', fetchMock)
    renderTab()
    expect(await screen.findByText('cara@example.com')).toBeTruthy()
    expect(screen.getByText('pending')).toBeTruthy()
    expect(screen.getByText('25-06-2026')).toBeTruthy()
    expect(screen.queryByText('Revoke')).toBeNull()
    expect(screen.queryByText('Invite')).toBeNull()
    // The member-safe endpoint is used, never the token-bearing manage list.
    expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/household/invitations/manage')).toBe(false)
  })
})
