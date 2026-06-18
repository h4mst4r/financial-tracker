import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ManagementTab } from '../src/components/settings/ManagementTab'
import { useAuthStore } from '../src/stores/authStore'
import type { Household, Person } from '../src/types/auth'
import type { InvitationManage, ListResponse, Member } from '../src/types/household'

const HH: Household = { householdId: 'h1', name: "Ben's Household", baseCurrency: 'SGD', timezone: 'Asia/Singapore' }
const OWNER: Person = {
  personId: 'p1', displayName: 'Ben', email: 'ben@example.com', role: 'owner',
  pictureUrl: null, defaultView: 'household', displayCurrency: 'SGD', canCreateHousehold: true,
}
const MEMBER: Person = { ...OWNER, personId: 'p2', email: 'mem@example.com', role: 'member', canCreateHousehold: false }

const MEMBERS: ListResponse<Member> = {
  items: [{ personId: 'p1', displayName: 'Ben Lim', email: 'ben@example.com', role: 'owner', pictureUrl: null, colour: null, status: 'active', canDelete: false }],
  total: 1,
}
const MANAGE: ListResponse<InvitationManage> = {
  items: [
    { invitationId: 'i1', invitedEmail: 'cara@example.com', status: 'pending', expiresAt: '2026-06-25', createdAt: '2026-06-18' },
    { invitationId: 'i2', invitedEmail: 'dan@example.com', status: 'declined', expiresAt: '2026-06-25', createdAt: '2026-06-18' },
  ],
  total: 2,
}

function makeResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
function noContent() {
  return new Response(null, { status: 204 })
}

function routeFetch() {
  return vi.fn(async (url: string | URL, opts?: RequestInit) => {
    const u = String(url)
    if (u === '/api/household/members') return makeResponse(MEMBERS)
    if (u === '/api/household/invitations/manage') return makeResponse(MANAGE)
    if (u === '/api/household/invitations' && (opts?.method ?? 'GET') === 'GET') {
      return makeResponse({ items: MANAGE.items, total: MANAGE.items.length })
    }
    if (u === '/api/household/invitations' && opts?.method === 'POST') {
      return makeResponse({ invitationId: 'i9', invitedEmail: 'new@example.com', status: 'pending', expiresAt: '2026-06-25', createdAt: '2026-06-18' })
    }
    if (u.endsWith('/resend')) return makeResponse(MANAGE.items[0])
    if (u.endsWith('/revoke')) return noContent()
    if (opts?.method === 'DELETE') return noContent()
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
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  useAuthStore.getState().clearAuth()
})

describe('ManagementTab — invitations (admin/owner, Story 2.6b)', () => {
  test('admin sees + Invite; modal submit fires create', async () => {
    renderTab()
    fireEvent.click(await screen.findByRole('button', { name: /Invite/ }))
    fireEvent.change(screen.getByLabelText('Google email'), { target: { value: 'new@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u, o]) => String(u) === '/api/household/invitations' && o?.method === 'POST')).toBe(true),
    )
    const call = fetchMock.mock.calls.find(([u, o]) => String(u) === '/api/household/invitations' && o?.method === 'POST')!
    expect(JSON.parse(call[1].body as string)).toEqual({ invitedEmail: 'new@example.com' })
  })

  test('pending row shows Copy link / Resend / Revoke; terminal row shows Delete', async () => {
    renderTab()
    expect(await screen.findByText('cara@example.com')).toBeTruthy()
    expect(screen.getByText('Copy link')).toBeTruthy()
    expect(screen.getByText('Resend')).toBeTruthy()
    expect(screen.getByText('Revoke')).toBeTruthy()
    expect(screen.getByText('Delete')).toBeTruthy()
  })

  test('Copy link copies the /join/<id> url', async () => {
    renderTab()
    fireEvent.click(await screen.findByText('Copy link'))
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('/join/i1')),
    )
  })

  test('Revoke POSTs revoke for its row', async () => {
    renderTab()
    fireEvent.click(await screen.findByText('Revoke'))
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u, o]) => String(u) === '/api/household/invitations/i1/revoke' && o?.method === 'POST')).toBe(true),
    )
  })

  test('member sees no + Invite and no row actions (2.5 read-only preserved)', async () => {
    useAuthStore.setState({ currentPerson: MEMBER })
    renderTab()
    expect(await screen.findByText('cara@example.com')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Invite/ })).toBeNull()
    expect(screen.queryByText('Revoke')).toBeNull()
    expect(screen.queryByText('Delete')).toBeNull()
    expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/household/invitations/manage')).toBe(false)
  })
})
