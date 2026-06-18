import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { JoinHousehold } from '../src/pages/JoinHousehold'
import { useAuthStore } from '../src/stores/authStore'
import type { Household, Person } from '../src/types/auth'
import type { InvitationValidation } from '../src/types/household'

const HH: Household = { householdId: 'h1', name: "Ben's Household", baseCurrency: 'SGD', timezone: 'Asia/Singapore' }
const PERSON: Person = {
  personId: 'p1', displayName: 'Ben', email: 'ben@example.com', role: 'member',
  pictureUrl: null, defaultView: 'household', displayCurrency: 'SGD', canCreateHousehold: false,
}

const PENDING: InvitationValidation = {
  status: 'pending',
  householdName: 'Acme',
  invitedByDisplayName: 'Ada',
  invitedEmail: 'ben@example.com',
  expiresAt: '2026-06-25',
}

function makeResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function routeFetch(validation: InvitationValidation) {
  return vi.fn(async (url: string | URL) => {
    const u = String(url)
    if (u === '/api/invitations/abc') return makeResponse(validation)
    throw new Error(`unexpected fetch ${u}`)
  })
}

function renderJoin() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/join/abc']}>
        <Routes>
          <Route path="/join/:token" element={children} />
          <Route path="/" element={<div>ROOT</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
  return render(<JoinHousehold />, { wrapper })
}

beforeEach(() => {
  vi.restoreAllMocks()
  useAuthStore.getState().clearAuth()
})

afterEach(() => {
  vi.unstubAllGlobals()
  useAuthStore.getState().clearAuth()
})

describe('JoinHousehold /join/:token (UX §4.1a)', () => {
  test('invalid token → Invite expired', async () => {
    vi.stubGlobal('fetch', routeFetch({ status: 'invalid' }))
    renderJoin()
    expect(await screen.findByRole('heading', { name: 'Invite expired' })).toBeTruthy()
  })

  test('valid + logged-out → invite-context card + Continue with Google', async () => {
    vi.stubGlobal('fetch', routeFetch(PENDING))
    renderJoin()
    expect(await screen.findByText('Ada invited you to join Acme')).toBeTruthy()
    expect(screen.getByText('member')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy()
  })

  test('valid + logged-in WITH a household → conflict dialog', async () => {
    useAuthStore.setState({ currentPerson: PERSON, household: HH })
    vi.stubGlobal('fetch', routeFetch(PENDING))
    renderJoin()
    expect(await screen.findByRole('heading', { name: 'Already in a household' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Go to Settings' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull()
  })

  test('email mismatch (logged-in) → Invite expired', async () => {
    useAuthStore.setState({ currentPerson: PERSON, household: HH })
    vi.stubGlobal('fetch', routeFetch({ ...PENDING, invitedEmail: 'someone@else.com' }))
    renderJoin()
    expect(await screen.findByRole('heading', { name: 'Invite expired' })).toBeTruthy()
  })
})
