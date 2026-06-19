import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ManagementTab } from '../src/components/settings/ManagementTab'
import { useAuthStore } from '../src/stores/authStore'
import type { Household, Person } from '../src/types/auth'
import type { ListResponse, Member } from '../src/types/household'

const HH: Household = {
  householdId: 'h1',
  name: "Ben's Household",
  baseCurrency: 'SGD',
  timezone: 'Asia/Singapore',
}
const base: Person = {
  personId: 'p0', displayName: 'X', email: 'x@example.com', role: 'admin',
  pictureUrl: null, defaultView: 'household', displayCurrency: 'SGD', canCreateHousehold: false,
  theme: 'base', font: 'base', density: 'comfortable', reduceMotion: false,
  notificationPrefs: { budgetWarnings: true, budgetOverruns: true, missedRecurring: true, upcomingPayments: false, fxStale: true, backups: false },
}
const OWNER: Person = { ...base, personId: 'pO', displayName: 'Owner', email: 'owner@example.com', role: 'owner' }
const ADMIN: Person = { ...base, personId: 'pA', displayName: 'Admin', email: 'admin@example.com', role: 'admin' }
const PLAIN: Person = { ...base, personId: 'pM', displayName: 'Mem', email: 'mem@example.com', role: 'member' }

const MEMBERS: ListResponse<Member> = {
  items: [
    { personId: 'pO', displayName: 'Owner', email: 'owner@example.com', role: 'owner', pictureUrl: null, colour: null, status: 'active', canDelete: false },
    { personId: 'pA', displayName: 'Admin', email: 'admin@example.com', role: 'admin', pictureUrl: null, colour: null, status: 'active', canDelete: false },
    { personId: 'pM', displayName: 'Mem', email: 'mem@example.com', role: 'member', pictureUrl: null, colour: null, status: 'active', canDelete: false },
  ],
  total: 3,
}

function makeResponse(body: unknown, status = 200) {
  if (status === 204) return new Response(null, { status })
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function routeFetch() {
  return vi.fn(async (url: string | URL, opts?: RequestInit) => {
    const u = String(url)
    const method = opts?.method ?? 'GET'
    if (u.startsWith('/api/household/members/') && u.endsWith('/remove') && method === 'POST') {
      return makeResponse(null, 204)
    }
    if (u === '/api/household/members') return makeResponse(MEMBERS)
    if (u === '/api/household/invitations/manage') return makeResponse({ items: [], total: 0 })
    if (u === '/api/household/invitations') return makeResponse({ items: [], total: 0 })
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
  useAuthStore.setState({ currentPerson: ADMIN, household: HH, csrfToken: 'csrf' })
  fetchMock = routeFetch()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  useAuthStore.getState().clearAuth()
})

describe('Members ⋮ Remove — visibility matrix (Path C)', () => {
  test('admin viewer: ⋮ on other-member row only; none on owner row or own row', async () => {
    renderTab()
    await screen.findByText('Mem')
    // Removable: the plain member (not owner, not self).
    expect(screen.getByLabelText('Actions for Mem')).toBeTruthy()
    // Not removable: the owner, and the admin's own row.
    expect(screen.queryByLabelText('Actions for Owner')).toBeNull()
    expect(screen.queryByLabelText('Actions for Admin')).toBeNull()
  })

  test('owner viewer: ⋮ on admin + member rows; none on own (owner) row', async () => {
    useAuthStore.setState({ currentPerson: OWNER })
    renderTab()
    await screen.findByText('Mem')
    expect(screen.getByLabelText('Actions for Admin')).toBeTruthy()
    expect(screen.getByLabelText('Actions for Mem')).toBeTruthy()
    expect(screen.queryByLabelText('Actions for Owner')).toBeNull()
  })

  test('plain member viewer: no ⋮ on any row', async () => {
    useAuthStore.setState({ currentPerson: PLAIN })
    renderTab()
    await screen.findByText('Owner')
    expect(screen.queryByLabelText(/^Actions for/)).toBeNull()
  })
})

describe('Members ⋮ Remove — action', () => {
  test('Remove → confirm → POST remove fires', async () => {
    renderTab()
    await screen.findByText('Mem')

    fireEvent.click(screen.getByLabelText('Actions for Mem'))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove' }))
    // Confirmation dialog → confirm.
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }))

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, o]) => String(u) === '/api/household/members/pM/remove' && o?.method === 'POST',
        ),
      ).toBe(true),
    )
  })
})
