import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { PendingInvitationDialog } from '../src/components/PendingInvitationDialog'
import { HouseholdConflictDialog } from '../src/components/HouseholdConflictDialog'
import { useAuthStore } from '../src/stores/authStore'
import type { Household, PendingInvitation, Person } from '../src/types/auth'

const HH: Household = { householdId: 'h1', name: "Ben's Household", baseCurrency: 'SGD', timezone: 'Asia/Singapore' }
const PERSON: Person = {
  personId: 'p1', displayName: 'Ben', email: 'ben@example.com', role: 'member',
  pictureUrl: null, defaultView: 'household', displayCurrency: 'SGD', canCreateHousehold: false,
}
const INVITE: PendingInvitation = {
  token: 'tok', householdId: 'h2', householdName: 'Acme', invitedByDisplayName: 'Ada',
  invitedEmail: 'ben@example.com', expiresAt: '2026-06-25', status: 'pending',
}

function noContent() {
  return new Response(null, { status: 204 })
}

/** Accept/decline are 204 POSTs; route by URL (typing `mock.calls`) and reject anything unexpected. */
function routeFetch() {
  return vi.fn(async (url: string | URL, opts?: RequestInit) => {
    const u = String(url)
    if (u.startsWith('/api/invitations/') && opts?.method === 'POST') return noContent()
    throw new Error(`unexpected fetch ${u}`)
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
  useAuthStore.getState().clearAuth()
})

afterEach(() => {
  vi.unstubAllGlobals()
  useAuthStore.getState().clearAuth()
})

function renderPending() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const result = render(<PendingInvitationDialog />, { wrapper })
  return { client, ...result }
}

describe('PendingInvitationDialog (UX §4.3)', () => {
  test('renders inviter, household and role', () => {
    useAuthStore.setState({ pendingInvitation: INVITE, household: null })
    renderPending()
    expect(screen.getByRole('heading', { name: "You've been invited" })).toBeTruthy()
    expect(screen.getByText('Ada')).toBeTruthy()
    expect(screen.getByText('Acme')).toBeTruthy()
    expect(screen.getByText('member')).toBeTruthy()
  })

  test('does not render when there is no pending invitation', () => {
    useAuthStore.setState({ pendingInvitation: null, household: null })
    renderPending()
    expect(screen.queryByRole('heading', { name: "You've been invited" })).toBeNull()
  })

  test('Accept POSTs accept and invalidates [auth, me]', async () => {
    useAuthStore.setState({ pendingInvitation: INVITE, household: null })
    const fetchMock = routeFetch()
    vi.stubGlobal('fetch', fetchMock)
    const { client } = renderPending()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u, o]) => String(u) === '/api/invitations/tok/accept' && o?.method === 'POST')).toBe(true),
    )
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['auth', 'me'] }))
  })

  test('Decline POSTs decline and clears the pending invitation', async () => {
    useAuthStore.setState({ pendingInvitation: INVITE, household: null })
    const fetchMock = routeFetch()
    vi.stubGlobal('fetch', fetchMock)
    renderPending()

    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u, o]) => String(u) === '/api/invitations/tok/decline' && o?.method === 'POST')).toBe(true),
    )
    await waitFor(() => expect(useAuthStore.getState().pendingInvitation).toBeNull())
  })
})

function renderConflict(role: Person['role']) {
  useAuthStore.setState({ currentPerson: { ...PERSON, role }, household: HH })
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HouseholdConflictDialog targetHouseholdName="Acme" token="tok" />} />
          <Route path="/settings" element={<div>SETTINGS PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('HouseholdConflictDialog (UX §4.4)', () => {
  test('owner copy + no Accept button', () => {
    renderConflict('owner')
    expect(screen.getByRole('heading', { name: 'Already own a household' })).toBeTruthy()
    expect(screen.getByText(/delete your current household first/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull()
  })

  test('member copy + no Accept button', () => {
    renderConflict('member')
    expect(screen.getByRole('heading', { name: 'Already in a household' })).toBeTruthy()
    expect(screen.getByText(/leave your current household first/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull()
  })

  test('Decline POSTs decline', async () => {
    const fetchMock = routeFetch()
    vi.stubGlobal('fetch', fetchMock)
    renderConflict('member')
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u, o]) => String(u) === '/api/invitations/tok/decline' && o?.method === 'POST')).toBe(true),
    )
  })

  test('Go to Settings navigates to /settings', async () => {
    renderConflict('member')
    fireEvent.click(screen.getByRole('button', { name: 'Go to Settings' }))
    expect(await screen.findByText('SETTINGS PAGE')).toBeTruthy()
  })
})
