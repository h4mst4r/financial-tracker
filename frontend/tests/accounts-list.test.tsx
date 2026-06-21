import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { AccountsList } from '../src/pages/AccountsList'
import type { Account } from '../src/types/account'
import type { Currency } from '../src/types/currency'
import type { Member } from '../src/types/household'
import type { Person } from '../src/types/auth'
import { api } from '../src/api/client'
import { useAuthStore } from '../src/stores/authStore'

const members: Member[] = [
  {
    personId: 'p1', displayName: 'Ben', email: 'ben@x.com', role: 'owner',
    pictureUrl: null, colour: '#6366f1', status: 'active', canDelete: false,
  },
  {
    personId: 'p2', displayName: 'Alex', email: 'alex@x.com', role: 'member',
    pictureUrl: null, colour: '#22c55e', status: 'active', canDelete: false,
  },
  {
    personId: 'p3', displayName: 'Sam', email: 'sam@x.com', role: 'member',
    pictureUrl: null, colour: '#f59e0b', status: 'archived', canDelete: false,
  },
]

const currencies: Currency[] = [
  {
    id: 'sgd', code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', colour: null, vivid: false,
    is_base: true, is_display_active: true, rate_to_base: '1.0', fee_pct: '0',
    last_rate_at: null, rate_source: null, rate_history: [],
  },
  {
    id: 'usd', code: 'USD', name: 'US Dollar', symbol: 'US$', colour: null, vivid: false,
    is_base: false, is_display_active: true, rate_to_base: '1.35', fee_pct: '0',
    last_rate_at: null, rate_source: null, rate_history: [],
  },
]

const accounts: Account[] = [
  {
    id: 'b1', account_type: 'bank', name: 'DBS Multiplier', currency: 'SGD', institution: 'DBS', notes: null,
    colour: '#6366f1', vivid: true, status: 'active', created_by: 'p1', updated_at: '2026-06-01T00:00:00',
    owner_ids: ['p1'], can_delete: true, delete_blocked_reason: null,
    current_value: '12840.0000', current_value_currency: 'SGD',
    value_series: ['12000.0000', '12400.0000', '12840.0000'],
    opening_balance: '12840.0000', opening_balance_date: '2026-06-01',
    account_number: null, interest_rate: null, interest_frequency: null, reserved_amount: null,
  },
  {
    id: 'b2', account_type: 'bank', name: 'POSB Everyday', currency: 'SGD', institution: 'POSB', notes: null,
    colour: null, vivid: false, status: 'active', created_by: 'p1', updated_at: '2026-06-01T00:00:00',
    owner_ids: ['p1'], can_delete: false, delete_blocked_reason: 'has transactions',
    current_value: '500.0000', current_value_currency: 'SGD',
    value_series: ['480.0000', '500.0000'],
    opening_balance: '500.0000', opening_balance_date: '2026-06-01',
    account_number: null, interest_rate: null, interest_frequency: null, reserved_amount: null,
  },
  {
    id: 'c1', account_type: 'capital', name: 'Stocks', currency: 'USD', institution: null, notes: null,
    colour: null, vivid: false, status: 'active', created_by: 'p1', updated_at: '2026-06-01T00:00:00',
    owner_ids: ['p1'], can_delete: true, delete_blocked_reason: null,
    current_value: '5000.0000', current_value_currency: 'USD',
    value_series: ['4800.0000', '5200.0000', '5000.0000'],
    investment_type: null, cost_basis: '5000.0000',
  },
  {
    id: 'm1', account_type: 'bank', name: 'Joint Savings', currency: 'SGD', institution: 'OCBC', notes: null,
    colour: null, vivid: false, status: 'active', created_by: 'p1', updated_at: '2026-06-01T00:00:00',
    owner_ids: ['p1', 'p2'], can_delete: true, delete_blocked_reason: null,
    current_value: '2000.0000', current_value_currency: 'SGD',
    value_series: ['2000.0000'],
    opening_balance: '2000.0000', opening_balance_date: '2026-06-01',
    account_number: null, interest_rate: null, interest_frequency: null, reserved_amount: null,
  },
  {
    id: 'cap1', account_type: 'capital', name: 'Old Fund', currency: 'SGD', institution: null, notes: null,
    colour: null, vivid: false, status: 'active', created_by: 'p1', updated_at: '2026-06-01T00:00:00',
    owner_ids: ['p1', 'p3'], can_delete: true, delete_blocked_reason: null,
    current_value: null, current_value_currency: null,
    value_series: [],
    investment_type: null, cost_basis: '9000.0000',
  },
  // Story 4.7 fixtures — a credit card (due/limit sub-line) and an interest-bearing bank.
  {
    id: 'cc1', account_type: 'credit_card', name: 'Amex Platinum', currency: 'SGD', institution: 'Amex', notes: null,
    colour: null, vivid: false, status: 'active', created_by: 'p1', updated_at: '2026-06-01T00:00:00',
    owner_ids: ['p1'], can_delete: true, delete_blocked_reason: null,
    current_value: '-3180.0000', current_value_currency: 'SGD',
    value_series: [],
    opening_balance: '0.0000', opening_balance_date: '2026-06-01',
    credit_limit: '20000.0000', billing_day: 15, due_day: 28, reward_points: 1200,
    annual_fee: '321.00', reward_type: 'points', bonus_limit: null, points_expiry: null,
  },
  {
    id: 'bk-int', account_type: 'bank', name: 'High Yield', currency: 'SGD', institution: 'GXS', notes: null,
    colour: null, vivid: false, status: 'active', created_by: 'p1', updated_at: '2026-06-01T00:00:00',
    owner_ids: ['p1'], can_delete: true, delete_blocked_reason: null,
    current_value: '8000.0000', current_value_currency: 'SGD',
    value_series: [],
    opening_balance: '8000.0000', opening_balance_date: '2026-06-01',
    account_number: '1234567890', interest_rate: '2.5000', interest_frequency: 'annual', reserved_amount: null,
  },
]

function renderPage(subtypes: Account['account_type'][] = ['bank', 'credit_card']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  render(<AccountsList subtypes={subtypes} title="Accounts" newLabel="account" />, { wrapper })
}

beforeEach(() => {
  useAuthStore.setState({ currentPerson: { personId: 'p1' } as unknown as Person })
  vi.spyOn(api, 'get').mockImplementation((url: string) => {
    if (url.startsWith('/api/currencies')) {
      return Promise.resolve({ data: { items: currencies, total: currencies.length }, status: 200 })
    }
    if (url.startsWith('/api/household/members')) {
      return Promise.resolve({ data: { items: members, total: members.length }, status: 200 })
    }
    if (/\/api\/accounts\/[^/]+\/snapshots/.test(url)) {
      return Promise.resolve({ data: { items: [], total: 0 }, status: 200 })
    }
    return Promise.resolve({ data: { items: accounts, total: accounts.length }, status: 200 })
  })
  vi.spyOn(api, 'post').mockResolvedValue({ data: {}, status: 201 })
  vi.spyOn(api, 'patch').mockResolvedValue({ data: {}, status: 200 })
  vi.spyOn(api, 'put').mockResolvedValue({ data: {}, status: 200 })
  vi.spyOn(api, 'delete').mockResolvedValue({ data: undefined, status: 204 })
})
afterEach(() => {
  vi.restoreAllMocks()
  useAuthStore.setState({ currentPerson: null })
})

describe('AccountsList', () => {
  test('renders only the cards matching the route subtypes', async () => {
    renderPage(['bank', 'credit_card'])
    expect(await screen.findByText('DBS Multiplier')).toBeTruthy()
    // Capital is filtered out on the /accounts route.
    expect(screen.queryByText('Stocks')).toBeNull()
  })

  test('a vivid account renders the vivid EntityCard fill', async () => {
    renderPage()
    await screen.findByText('DBS Multiplier')
    // DBS Multiplier (b1) is the first, vivid card; POSB (b2) is calm.
    const card = screen.getAllByTestId('entity-card')[0]
    expect(card.getAttribute('data-vivid')).toBe('true')
  })

  test('New → the type Dropdown swaps the opening-balance fields in/out', async () => {
    renderPage()
    await screen.findByText('DBS Multiplier')
    fireEvent.click(screen.getByTestId('entity-page-new'))
    // Default type is bank (ledger-backed) → opening balance shown.
    expect(await screen.findByText('Opening balance')).toBeTruthy()
    // Switch to capital (asset-like) → opening balance hidden.
    fireEvent.click(screen.getByLabelText(/Type/))
    fireEvent.click(screen.getByRole('option', { name: 'Capital' }))
    expect(screen.queryByText('Opening balance')).toBeNull()
  })

  test('saving a bank POSTs the subtype-shaped payload', async () => {
    renderPage()
    await screen.findByText('DBS Multiplier')
    fireEvent.click(screen.getByTestId('entity-page-new'))
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: 'My Bank' } })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/accounts',
        expect.objectContaining({
          account_type: 'bank',
          name: 'My Bank',
          opening_balance: '1000',
          vivid: false,
        }),
      ),
    )
  })

  // ── Lifecycle ⋮ menu (Story 4.2) ──

  async function openMenu(index: number) {
    await screen.findByText('DBS Multiplier')
    fireEvent.click(screen.getAllByLabelText('Actions')[index])
  }

  test('Duplicate POSTs the duplicate endpoint', async () => {
    renderPage()
    await openMenu(0) // b1
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/accounts/b1/duplicate'))
  })

  test('Archive confirms then POSTs the archive endpoint', async () => {
    renderPage()
    await openMenu(0) // b1 (active → Archive)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }))
    // The confirm dialog appears; the menu has closed so "Archive" is now the dialog button.
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/accounts/b1/archive'))
  })

  test('Delete is disabled with the blocker reason when can_delete=false', async () => {
    renderPage()
    await openMenu(1) // b2 (has transactions)
    const del = screen.getByRole('menuitem', { name: 'Delete' })
    expect((del as HTMLButtonElement).disabled).toBe(true)
    expect(del.getAttribute('title')).toBe('has transactions')
  })

  test('Delete confirms then calls DELETE for a deletable account', async () => {
    renderPage()
    await openMenu(0) // b1 (deletable)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/accounts/b1'))
  })

  test('the Archived toggle refetches with include_archived', async () => {
    renderPage()
    await screen.findByText('DBS Multiplier')
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/api/accounts?include_archived=true'),
    )
  })

  // ── Multiple owners (Story 4.3) ──

  test('a multi-owner card renders stacked owner avatars; single-owner shows none', async () => {
    renderPage()
    await screen.findByText('Joint Savings')
    // Only m1 (owners p1+p2) renders avatars → exactly Ben + Alex. b1/b2 single-owner show none.
    // (Every card's MiniSparkline is also role="img" — exclude it; this test is about owner avatars.)
    const avatars = (await screen.findAllByRole('img')).filter(
      (a) => a.getAttribute('aria-label') !== 'Value history sparkline',
    )
    expect(avatars.map((a) => a.getAttribute('aria-label')).sort()).toEqual(['Alex', 'Ben'])
  })

  test('editing an account: owner chips prefill and adding an owner PUTs the new set', async () => {
    renderPage()
    await screen.findByText('DBS Multiplier')
    fireEvent.click(screen.getAllByLabelText('Actions')[0]) // b1 — sole owner Ben (p1)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    await screen.findByText('Owners')
    fireEvent.click(screen.getByText('add owner…'))
    fireEvent.click(screen.getByRole('option', { name: /Alex/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/api/accounts/b1/owners', { owner_ids: ['p1', 'p2'] }),
    )
  })

  test('the last owner cannot be removed', async () => {
    renderPage()
    await screen.findByText('DBS Multiplier')
    fireEvent.click(screen.getAllByLabelText('Actions')[0]) // b1 — sole owner Ben
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    await screen.findByText('Owners')
    const remove = screen.getByRole('button', { name: 'Remove Ben' })
    expect((remove as HTMLButtonElement).disabled).toBe(true)
  })

  test('an archived owner resolves to a name in the modal and is not offered to add', async () => {
    renderPage(['capital'])
    await screen.findByText('Old Fund')
    // Old Fund (cap1) is owned by p1 (Ben, active) + p3 (Sam, archived).
    fireEvent.click(screen.getAllByLabelText('Actions')[1]) // c1=Stocks[0], cap1=Old Fund[1]
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    await screen.findByText('Owners')
    // The archived owner shows their name, not the raw UUID.
    expect(screen.getByText('Sam')).toBeTruthy()
    expect(screen.queryByText('p3')).toBeNull()
    // The add-owner dropdown offers active members only — Alex (active), never Sam (archived).
    fireEvent.click(screen.getByText('add owner…'))
    expect(screen.getByRole('option', { name: /Alex/ })).toBeTruthy()
    expect(screen.queryByRole('option', { name: /Sam/ })).toBeNull()
  })

  test('creating with a second owner POSTs owner_ids', async () => {
    renderPage()
    await screen.findByText('DBS Multiplier')
    fireEvent.click(screen.getByTestId('entity-page-new'))
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: 'Joint' } })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1000' } })
    fireEvent.click(screen.getByText('add owner…'))
    fireEvent.click(screen.getByRole('option', { name: /Alex/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/accounts',
        expect.objectContaining({ owner_ids: ['p1', 'p2'] }),
      ),
    )
  })

  // ── Native currency + value snapshots (Story 4.4) ──

  test('New: a required Currency picker defaults to the base; create POSTs the currency', async () => {
    renderPage()
    await screen.findByText('DBS Multiplier')
    fireEvent.click(screen.getByTestId('entity-page-new'))
    await screen.findByText('Opening balance')
    // The Currency picker is present and defaults to the household base (SGD).
    expect(screen.getByLabelText(/Currency/)).toHaveTextContent('SGD')
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'My Bank' } })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/accounts',
        expect.objectContaining({ account_type: 'bank', currency: 'SGD' }),
      ),
    )
  })

  test('editing an account with history disables the Currency picker', async () => {
    renderPage()
    await openMenu(1) // b2 — has transactions (can_delete=false) → currency locked
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    await screen.findByText('Owners')
    expect((screen.getByLabelText(/Currency/) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Currency locks once the account has activity/)).toBeTruthy()
  })

  test('⋮ → Add value snapshot opens the modal and POSTs the snapshot', async () => {
    renderPage()
    await openMenu(0) // b1 (SGD)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add value snapshot' }))
    // The modal header shows there are no snapshots yet (its GET returned an empty list).
    await screen.findByText('No snapshots yet')
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '13000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save snapshot' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/accounts/b1/snapshots',
        expect.objectContaining({ value: '13000', currency: 'SGD', source: 'manual' }),
      ),
    )
  })

  test('the hero shows the native-currency value and the meta shows the native code', async () => {
    renderPage(['capital'])
    // Stocks (c1) is a USD account with a current value; Old Fund (cap1) has none.
    const stocks = await screen.findByText('Stocks')
    const stocksCard = stocks.closest('[data-testid="entity-card"]') as HTMLElement
    expect(stocksCard.textContent).toContain('US$')
    expect(stocksCard.textContent).toContain('USD') // native code in the meta
    const oldFund = screen.getByText('Old Fund')
    const oldFundCard = oldFund.closest('[data-testid="entity-card"]') as HTMLElement
    expect(oldFundCard.textContent).toContain('—') // current_value null → em dash
  })

  // ── Bank & credit-card details (Story 4.7) ──

  test('a bank card shows the interest-rate sub-line when set', async () => {
    renderPage(['bank', 'credit_card'])
    const card = (await screen.findByText('High Yield')).closest(
      '[data-testid="entity-card"]',
    ) as HTMLElement
    expect(card.textContent).toContain('2.5% · annual')
  })

  test('a credit-card card shows the computed due date + limit; hero stays the value', async () => {
    renderPage(['bank', 'credit_card'])
    const card = (await screen.findByText('Amex Platinum')).closest(
      '[data-testid="entity-card"]',
    ) as HTMLElement
    expect(card.textContent).toMatch(/due \d{1,2} \w{3}/) // computed "due D Mon"
    expect(card.textContent).toContain('limit S$ 20,000')
    // The hero is the current value, NOT the red Debt-owing hero (that is Epic 8).
    expect(card.textContent).toContain('S$ -3,180.00')
  })

  test('the subtype slot swaps bank ↔ credit-card fields', async () => {
    renderPage()
    await screen.findByText('DBS Multiplier')
    fireEvent.click(screen.getByTestId('entity-page-new'))
    expect(await screen.findByLabelText(/Interest rate/)).toBeTruthy()
    expect(screen.queryByLabelText(/Credit limit/)).toBeNull()
    fireEvent.click(screen.getByLabelText(/Type/))
    fireEvent.click(screen.getByRole('option', { name: 'Credit card' }))
    expect(await screen.findByLabelText(/Credit limit/)).toBeTruthy()
    expect(screen.queryByLabelText(/Interest rate/)).toBeNull()
  })

  test('saving a bank POSTs only bank subtype fields; empty optionals as null', async () => {
    renderPage()
    await screen.findByText('DBS Multiplier')
    fireEvent.click(screen.getByTestId('entity-page-new'))
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: 'My Bank' } })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText(/Interest rate/), { target: { value: '2.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const body = (api.post as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1] as Record<
      string,
      unknown
    >
    expect(body.interest_rate).toBe('2.5')
    expect(body.account_number).toBeNull() // empty optional → null, never ''
    expect('credit_limit' in body).toBe(false) // no cross-subtype keys
  })

  test('saving a credit card POSTs day ints as numbers and limit as a string', async () => {
    renderPage()
    await screen.findByText('DBS Multiplier')
    fireEvent.click(screen.getByTestId('entity-page-new'))
    fireEvent.click(screen.getByLabelText(/Type/))
    fireEvent.click(screen.getByRole('option', { name: 'Credit card' }))
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: 'My Card' } })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText(/Credit limit/), { target: { value: '5000' } })
    fireEvent.change(screen.getByLabelText(/Billing day/), { target: { value: '15' } })
    fireEvent.change(screen.getByLabelText(/Due day/), { target: { value: '28' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const body = (api.post as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1] as Record<
      string,
      unknown
    >
    expect(body.credit_limit).toBe('5000') // Decimal → wire string
    expect(body.billing_day).toBe(15) // int → number
    expect(body.due_day).toBe(28)
    expect('interest_rate' in body).toBe(false)
  })

  test('editing a credit card prefills its subtype fields (AC4)', async () => {
    renderPage(['bank', 'credit_card'])
    await screen.findByText('Amex Platinum')
    fireEvent.click(screen.getAllByLabelText('Actions')[3]) // cc1 (Amex Platinum)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    await screen.findByText('Owners')
    expect((screen.getByLabelText(/Credit limit/) as HTMLInputElement).value).toBe('20000.0000')
    expect((screen.getByLabelText(/Due day/) as HTMLInputElement).value).toBe('28')
  })

  test('an out-of-range due day blocks Save', async () => {
    renderPage()
    await screen.findByText('DBS Multiplier')
    fireEvent.click(screen.getByTestId('entity-page-new'))
    fireEvent.click(screen.getByLabelText(/Type/))
    fireEvent.click(screen.getByRole('option', { name: 'Credit card' }))
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: 'My Card' } })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText(/Due day/), { target: { value: '40' } })
    expect((screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('the card renders the value-history sparkline, or a placeholder when there is no history', async () => {
    renderPage(['capital'])
    // Stocks (c1) has a ≥2-point value_series → the sparkline SVG renders.
    const stocks = await screen.findByText('Stocks')
    const stocksCard = stocks.closest('[data-testid="entity-card"]') as HTMLElement
    expect(stocksCard.querySelector('svg.spark')).toBeTruthy()
    expect(stocksCard.querySelector('[data-testid="spark-empty"]')).toBeNull()
    // Old Fund (cap1) has value_series: [] → the "no history yet" placeholder, no chart.
    const oldFund = screen.getByText('Old Fund')
    const oldFundCard = oldFund.closest('[data-testid="entity-card"]') as HTMLElement
    expect(oldFundCard.querySelector('[data-testid="spark-empty"]')).toBeTruthy()
    expect(oldFundCard.querySelector('svg.spark')).toBeNull()
  })
})
