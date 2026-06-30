// Shared fixtures for the ManagementTab integration suites (management-tab, members-remove,
// members-lifecycle, invite, integrations, danger-zone). Only the genuinely INVARIANT pieces live here:
// the household, the notification-prefs block, the response helper, and the render harness. Each suite
// keeps its own Person ids / MEMBERS list / routeFetch, because those are entangled with that suite's
// URL + body assertions (e.g. `members/pM/role`) and must stay local to read.

import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ManagementTab } from '../../src/components/settings/ManagementTab'
import type { Household, NotificationPrefs } from '../../src/types/auth'

export const HH: Household = {
  householdId: 'h1',
  name: "Ben's Household",
  baseCurrency: 'SGD',
  timezone: 'Asia/Singapore',
}

export const PREFS: NotificationPrefs = {
  budgetWarnings: true,
  budgetOverruns: true,
  missedRecurring: true,
  upcomingPayments: false,
  fxStale: true,
  backups: false,
}

/** JSON Response helper; a 204 yields a null-body Response (a 204 cannot carry a body). */
export function makeResponse(body: unknown, status = 200): Response {
  if (status === 204) return new Response(null, { status })
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** Render <ManagementTab/> inside the Router + a no-retry QueryClient (the live route's providers). */
export function renderManagementTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
  return render(<ManagementTab />, { wrapper })
}
