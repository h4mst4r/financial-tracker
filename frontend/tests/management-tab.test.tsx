import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ManagementTab } from '../src/components/settings/ManagementTab'
import { useAuthStore } from '../src/stores/authStore'
import type { Household, Person } from '../src/types/auth'
import type { Invitation, ListResponse, Member } from '../src/types/household'

const HH: Household = { householdId: 'h1', name: "Ben's Household", baseCurrency: 'SGD', timezone: 'Asia/Singapore' }
const OWNER: Person = {
  personId: 'p1', displayName: 'Ben', email: 'ben@example.com', role: 'owner',
  pictureUrl: null, defaultView: 'household', displayCurrency: 'SGD', canCreateHousehold: true,
}
const MEMBER: Person = { ...OWNER, personId: 'p2', displayName: 'Mem', email: 'mem@example.com', role: 'member', canCreateHousehold: false }

const MEMBERS: ListResponse<Member> = {
  items: [
    { personId: 'p1', displayName: 'Ben Lim', email: 'ben@example.com', role: 'owner', pictureUrl: null, colour: '#6366f1', status: 'active' },
    { personId: 'p2', displayName: 'Alex Lim', email: 'alex@example.com', role: 'admin', pictureUrl: null, colour: null, status: 'active' },
  ],
  total: 2,
}

function makeResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** Route fetch by URL so the two list queries + the PATCH each get the right body. */
function routeFetch(overrides: { members?: ListResponse<Member>; invitations?: ListResponse<Invitation>; patch?: Household } = {}) {
  const members = overrides.members ?? MEMBERS
  const invitations = overrides.invitations ?? { items: [], total: 0 }
  return vi.fn(async (url: string | URL, opts?: RequestInit) => {
    const u = String(url)
    if (u === '/api/household' && opts?.method === 'PATCH') {
      return makeResponse(overrides.patch ?? { ...HH, name: 'Renamed' })
    }
    if (u === '/api/household/members') return makeResponse(members)
    if (u === '/api/household/invitations') return makeResponse(invitations)
    throw new Error(`unexpected fetch ${u}`)
  })
}

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
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
    expect(screen.getByText('Owner only')).toBeTruthy()
  })

  test('base currency is read-only; no base-currency selector or date-format field (P0)', () => {
    renderTab()
    const baseCcy = screen.getByLabelText('Base currency') as HTMLInputElement
    expect(baseCcy.value).toBe('SGD')
    expect(baseCcy.readOnly).toBe(true)
    expect(screen.queryByText(/date format/i)).toBeNull()
  })
})

describe('ManagementTab — lists', () => {
  test('members list renders rows; no ⋮ menu / + Invite (P0)', async () => {
    renderTab()
    expect(await screen.findByText('Ben Lim')).toBeTruthy()
    expect(screen.getByText('Alex Lim')).toBeTruthy()
    expect(screen.getByText('alex@example.com')).toBeTruthy()
    expect(screen.getByText('owner')).toBeTruthy()
    expect(screen.getByText('admin')).toBeTruthy()
    expect(screen.queryByText('+ Invite')).toBeNull()
    expect(screen.queryByText('⋮')).toBeNull()
  })

  test('invitations empty → EmptyState', async () => {
    renderTab()
    expect(await screen.findByText('No invitations yet')).toBeTruthy()
  })

  test('invitations render rows with status + expiry; no actions', async () => {
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
  })
})
