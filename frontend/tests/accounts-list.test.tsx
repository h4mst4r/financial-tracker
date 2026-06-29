import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { AccountsList } from '../src/pages/AccountsList'
import type { Account, AccountSnapshot } from '../src/types/account'
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
    annual_fee: '321.00', reward_type: 'points', reward_rate: null, bonus_limit: null, points_expiry: null,
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
  // Story 4.8 fixtures — capital with a gain ROI (same ccy), capital with a cross-ccy current value
  // (no ROI), an asset, and an insurance policy.
  {
    id: 'cap-roi', account_type: 'capital', name: 'Growth Fund', currency: 'SGD', institution: null, notes: null,
    colour: null, vivid: false, status: 'active', created_by: 'p1', updated_at: '2026-06-01T00:00:00',
    owner_ids: ['p1'], can_delete: true, delete_blocked_reason: null,
    current_value: '44200.0000', current_value_currency: 'SGD',
    value_series: ['40000.0000', '44200.0000'],
    investment_type: 'ETF', cost_basis: '40000.0000',
  },
  {
    id: 'cap-xccy', account_type: 'capital', name: 'Overseas Fund', currency: 'SGD', institution: null, notes: null,
    colour: null, vivid: false, status: 'active', created_by: 'p1', updated_at: '2026-06-01T00:00:00',
    owner_ids: ['p1'], can_delete: true, delete_blocked_reason: null,
    // Current value reported in USD while the account is native SGD → the same-ccy guard suppresses ROI.
    current_value: '44200.0000', current_value_currency: 'USD',
    value_series: [],
    investment_type: null, cost_basis: '40000.0000',
  },
  {
    id: 'ast1', account_type: 'asset', name: 'Family Home', currency: 'SGD', institution: null, notes: null,
    colour: null, vivid: false, status: 'active', created_by: 'p1', updated_at: '2026-06-01T00:00:00',
    owner_ids: ['p1'], can_delete: true, delete_blocked_reason: null,
    current_value: '1450000.0000', current_value_currency: 'SGD',
    value_series: [],
    asset_type: 'property', registration_no: 'LOT-12345', purchase_date: '2015-03-01', purchase_value: '900000.0000',
  },
  {
    id: 'ins1', account_type: 'insurance', name: 'Life Policy', currency: 'SGD', institution: null, notes: null,
    colour: null, vivid: false, status: 'active', created_by: 'p1', updated_at: '2026-06-01T00:00:00',
    owner_ids: ['p1'], can_delete: true, delete_blocked_reason: null,
    current_value: '250000.0000', current_value_currency: 'SGD',
    value_series: [],
    policy_no: 'LIFE-90213', insurer: 'Prudential', policy_type: 'life', policy_status: 'active',
    premium_frequency: 'annual', coverage_death: '250000.0000', coverage_tpd: '250000.0000',
    coverage_ci: '100000.0000', coverage_early_ci: null, coverage_personal_accident: null,
    coverage_hospital: 'Private', surrender_value: '12400.0000', surrender_inquiry_date: null,
  },
]

function renderPage(subtypes: Account['account_type'][] = ['bank', 'credit_card']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  render(<AccountsList subtypes={subtypes} title="Accounts" newLabel="account" emptyKey="accounts" />, { wrapper })
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
    if (url.startsWith('/api/entity-preferences')) {
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
    // A multi-subtype route so the Type dropdown is enabled (Story 4.12 restricts + can lock it).
    renderPage(['bank', 'capital'])
    await screen.findByText('DBS Multiplier')
    fireEvent.click(screen.getByTestId('entity-page-new'))
    // Default type is bank (subtypes[0], ledger-backed) → opening balance shown.
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

  // Tap a card body → flip to the §8.2b read detail view (Story 4.11).
  async function openDetail(name = 'DBS Multiplier') {
    await screen.findByText(name)
    fireEvent.click(screen.getByLabelText(`Open ${name}`))
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

  // ── Account detail view: flip + inline mini-ledger (Story 4.11) ──

  test('tapping a card opens the §8.2b detail view, not the edit modal', async () => {
    renderPage()
    await openDetail()
    // The detail view shows the Value-history region; the §8.2 edit modal (its Owners field) is NOT open.
    expect(await screen.findByText('Value history')).toBeTruthy()
    expect(screen.queryByText('Owners')).toBeNull()
  })

  test('admin adds a snapshot via the inline add-row (POST)', async () => {
    useAuthStore.setState({ currentPerson: { personId: 'p1', role: 'owner' } as unknown as Person })
    renderPage()
    await openDetail()
    fireEvent.click(await screen.findByText(/Add snapshot/))
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '13000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/accounts/b1/snapshots',
        expect.objectContaining({ value: '13000', currency: 'SGD', source: 'manual' }),
      ),
    )
  })

  // ── Snapshot mini-ledger: inline cell edit & delete (Story 4.11) ──

  const snapshotRow: AccountSnapshot = {
    id: 's1', account_id: 'b1', snapshot_date: '2026-06-14', value: '13000.0000',
    currency: 'SGD', value_base: '13000.0000', source: 'manual', note: null,
    created_at: '2026-06-14T00:00:00',
  }

  function mockSnapshots(items: AccountSnapshot[]) {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.startsWith('/api/currencies'))
        return Promise.resolve({ data: { items: currencies, total: currencies.length }, status: 200 })
      if (url.startsWith('/api/household/members'))
        return Promise.resolve({ data: { items: members, total: members.length }, status: 200 })
      if (/\/api\/accounts\/[^/]+\/snapshots/.test(url))
        return Promise.resolve({ data: { items, total: items.length }, status: 200 })
      return Promise.resolve({ data: { items: accounts, total: accounts.length }, status: 200 })
    })
  }

  test('admin double-clicks a value cell → editor prefills → Enter PATCHes the field', async () => {
    useAuthStore.setState({ currentPerson: { personId: 'p1', role: 'owner' } as unknown as Person })
    mockSnapshots([snapshotRow])
    renderPage()
    await openDetail()
    fireEvent.doubleClick(await screen.findByLabelText(/Edit the .* value/))
    const input = screen.getByPlaceholderText('0.00') as HTMLInputElement
    expect(input.value).toBe('13000') // clean prefill — no dead 13000.0000
    fireEvent.change(input, { target: { value: '14000' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // Snapshots are native currency — the PATCH sends only the value (no currency picker).
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/accounts/b1/snapshots/s1', { value: '14000' }),
    )
  })

  test('a failed cell PATCH rolls back the optimistic value', async () => {
    useAuthStore.setState({ currentPerson: { personId: 'p1', role: 'owner' } as unknown as Person })
    mockSnapshots([snapshotRow])
    vi.mocked(api.patch).mockRejectedValueOnce(new Error('boom'))
    renderPage()
    await openDetail()
    fireEvent.doubleClick(await screen.findByLabelText(/Edit the .* value/))
    const input = screen.getByPlaceholderText('0.00') as HTMLInputElement
    fireEvent.change(input, { target: { value: '99999' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    // The optimistic 99,999 is reverted to the stored 13,000 on the failed write.
    await waitFor(() =>
      expect((screen.getByLabelText(/Edit the .* value/) as HTMLElement).textContent).toContain('13,000'),
    )
  })

  test('admin deletes a snapshot row via confirm (DELETE)', async () => {
    useAuthStore.setState({ currentPerson: { personId: 'p1', role: 'owner' } as unknown as Person })
    mockSnapshots([snapshotRow])
    renderPage()
    await openDetail()
    fireEvent.click(await screen.findByLabelText(/Delete the .* snapshot/))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' })) // confirm dialog
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/accounts/b1/snapshots/s1'))
  })

  test('a member sees the value-history read-only (no edit/delete affordances)', async () => {
    useAuthStore.setState({ currentPerson: { personId: 'p2', role: 'member' } as unknown as Person })
    mockSnapshots([snapshotRow])
    renderPage()
    await openDetail()
    await screen.findByText('Value history')
    expect(screen.queryByLabelText(/Edit the .* value/)).toBeNull()
    expect(screen.queryByLabelText(/Delete the .* snapshot/)).toBeNull()
    expect(screen.queryByText(/Add snapshot/)).toBeNull()
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
    expect(card.textContent).toContain('limit S$ 20,000.00') // §7 atom renders the currency minor-units (2dp)
    // The hero is the current value, NOT the red Debt-owing hero (that is Epic 8). §7: leading − (U+2212).
    expect(card.textContent).toContain('−S$ 3,180.00')
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
    expect((screen.getByLabelText(/Credit limit/) as HTMLInputElement).value).toBe('20000') // clean prefill
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

  // ── Capital / asset / insurance details (Story 4.8) ──

  test('a capital card shows the gain-green ROI sub-line (same-ccy)', async () => {
    renderPage(['capital'])
    const card = (await screen.findByText('Growth Fund')).closest(
      '[data-testid="entity-card"]',
    ) as HTMLElement
    // The ROI figure is the §7 atom inside the gain-green tone wrapper (the figure isn't a single
    // text node, so assert via the card text + the toned wrapper).
    expect(card.textContent).toContain('ROI +S$ 4,200.00')
    const tone = card.querySelector('.text-success') as HTMLElement
    expect(tone?.textContent).toContain('+S$ 4,200.00')
  })

  test('a capital card renders cross-currency ROI (current value converted to native)', async () => {
    renderPage(['capital'])
    const card = (await screen.findByText('Overseas Fund')).closest(
      '[data-testid="entity-card"]',
    ) as HTMLElement
    // current 44,200 USD → native SGD (×1.35) = 59,670; − 40,000 cost basis = +S$ 19,670.00 (Story 4.11
    // relaxed the same-currency guard — a cross-currency current value now yields ROI).
    expect(card.textContent).toContain('ROI +S$ 19,670.00')
  })

  test('an insurance card shows the coverage · policy_type sub-line', async () => {
    renderPage(['insurance'])
    const card = (await screen.findByText('Life Policy')).closest(
      '[data-testid="entity-card"]',
    ) as HTMLElement
    expect(card.textContent).toContain('coverage · life')
  })

  test('an asset card shows the value hero and no ROI/coverage sub-line', async () => {
    renderPage(['asset'])
    const card = (await screen.findByText('Family Home')).closest(
      '[data-testid="entity-card"]',
    ) as HTMLElement
    expect(card.textContent).toContain('S$ 1,450,000.00')
    expect(card.textContent).not.toContain('ROI')
    expect(card.textContent).not.toContain('coverage')
  })

  test('the subtype slot swaps to capital, then to insurance fields', async () => {
    // Multi-subtype route so the Type dropdown is enabled and can swap (single-subtype routes lock it).
    renderPage(['capital', 'insurance'])
    await screen.findByText('Growth Fund')
    fireEvent.click(screen.getByTestId('entity-page-new'))
    // capital is pre-selected (subtypes[0]) → its fields already show.
    expect(await screen.findByLabelText(/Investment type/)).toBeTruthy()
    expect(screen.getByLabelText(/Cost basis/)).toBeTruthy()
    expect(screen.queryByLabelText(/Death cover/)).toBeNull()
    fireEvent.click(screen.getByLabelText(/Type/))
    fireEvent.click(screen.getByRole('option', { name: 'Insurance' }))
    expect(await screen.findByLabelText(/Death cover/)).toBeTruthy()
    expect(screen.queryByLabelText(/Cost basis/)).toBeNull()
  })

  test('saving a capital POSTs cost_basis as a string and no cross-subtype keys', async () => {
    renderPage(['capital']) // single-subtype route → type pre-selected + locked to capital
    await screen.findByText('Growth Fund')
    fireEvent.click(screen.getByTestId('entity-page-new'))
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: 'My Fund' } })
    fireEvent.change(screen.getByLabelText(/Investment type/), { target: { value: 'ETF' } })
    fireEvent.change(screen.getByLabelText(/Cost basis/), { target: { value: '40000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const body = (api.post as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1] as Record<
      string,
      unknown
    >
    expect(body.account_type).toBe('capital')
    expect(body.cost_basis).toBe('40000') // Decimal → wire string
    expect(body.investment_type).toBe('ETF')
    expect('opening_balance' in body).toBe(false) // asset-like — no ledger fields
    expect('credit_limit' in body).toBe(false)
  })

  test('saving an insurance POSTs coverage decimals as strings, empty optionals as null', async () => {
    renderPage(['insurance']) // single-subtype route → type pre-selected + locked to insurance
    await screen.findByText('Life Policy')
    fireEvent.click(screen.getByTestId('entity-page-new'))
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: 'My Policy' } })
    fireEvent.click(screen.getByLabelText(/Policy type/))
    fireEvent.click(screen.getByRole('option', { name: 'life' }))
    fireEvent.change(screen.getByLabelText(/Death cover/), { target: { value: '250000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const body = (api.post as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1] as Record<
      string,
      unknown
    >
    expect(body.coverage_death).toBe('250000') // Decimal → wire string
    expect(body.policy_type).toBe('life')
    expect(body.coverage_tpd).toBeNull() // empty optional → null
    expect(body.surrender_inquiry_date).toBeNull() // empty date → null
    expect('interest_rate' in body).toBe(false) // no cross-subtype keys
  })

  test('a negative cost basis blocks Save', async () => {
    renderPage(['capital']) // type pre-selected + locked to capital
    await screen.findByText('Growth Fund')
    fireEvent.click(screen.getByTestId('entity-page-new'))
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: 'My Fund' } })
    fireEvent.change(screen.getByLabelText(/Cost basis/), { target: { value: '-5000' } })
    expect((screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('editing an insurance prefills policy type + coverage fields (AC4)', async () => {
    renderPage(['insurance'])
    await screen.findByText('Life Policy')
    fireEvent.click(screen.getAllByLabelText('Actions')[0]) // ins1
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    await screen.findByText('Owners')
    expect(screen.getByLabelText(/Policy type/)).toHaveTextContent('life')
    expect((screen.getByLabelText(/Death cover/) as HTMLInputElement).value).toBe('250000') // clean prefill
  })

  test('editing a capital prefills investment type + cost basis (AC4)', async () => {
    renderPage(['capital'])
    await screen.findByText('Growth Fund')
    // c1 (Stocks) is first on the capital route — cost_basis '5000.0000' → cleaned to '5000'.
    fireEvent.click(screen.getAllByLabelText('Actions')[0])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    await screen.findByText('Owners')
    expect((screen.getByLabelText(/Cost basis/) as HTMLInputElement).value).toBe('5000')
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

  // ── Currency display toggle (Story 4.9) ──

  test('a chosen display currency converts the hero; the native code stays in the meta', async () => {
    useAuthStore.setState({ currentPerson: { personId: 'p1', displayCurrency: 'USD' } as unknown as Person })
    renderPage(['bank', 'credit_card'])
    const card = (await screen.findByText('DBS Multiplier')).closest(
      '[data-testid="entity-card"]',
    ) as HTMLElement
    // 12,840 SGD ÷ 1.35 (USD rate_to_base) = 9,511.11, shown with the USD symbol. Await the
    // post-fetch re-render — before the currencies query resolves the hero shows the native fallback.
    await waitFor(() => expect(card.textContent).toContain('US$ 9,511.11'))
    // The account's native code is never hidden — still in the footer meta.
    expect(card.textContent).toContain('Bank · SGD')
  })

  test('Native mode shows each hero in its own currency', async () => {
    useAuthStore.setState({ currentPerson: { personId: 'p1', displayCurrency: 'native' } as unknown as Person })
    renderPage(['bank', 'credit_card'])
    const card = (await screen.findByText('DBS Multiplier')).closest(
      '[data-testid="entity-card"]',
    ) as HTMLElement
    expect(card.textContent).toContain('S$ 12,840.00')
  })

  test('a display currency with no rate falls back to the native value', async () => {
    // EUR is not in the currencies fixture → no rate_to_base → render native, never NaN.
    useAuthStore.setState({ currentPerson: { personId: 'p1', displayCurrency: 'EUR' } as unknown as Person })
    renderPage(['bank', 'credit_card'])
    const card = (await screen.findByText('DBS Multiplier')).closest(
      '[data-testid="entity-card"]',
    ) as HTMLElement
    expect(card.textContent).toContain('S$ 12,840.00')
  })

  // ── Story 4.12: create/edit UX + rewards model + favourite star ──

  test('the Type dropdown is restricted to the route subtypes (no insurance from /accounts)', async () => {
    renderPage(['bank', 'credit_card'])
    await screen.findByText('DBS Multiplier')
    fireEvent.click(screen.getByTestId('entity-page-new'))
    fireEvent.click(await screen.findByLabelText(/Type/))
    expect(screen.queryByRole('option', { name: 'Insurance' })).toBeNull()
    expect(screen.queryByRole('option', { name: 'Capital' })).toBeNull()
    expect(screen.getByRole('option', { name: 'Bank' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Credit card' })).toBeTruthy()
  })

  test('a single-subtype route pre-selects + locks the Type (insurance fields show, dropdown disabled)', async () => {
    renderPage(['insurance'])
    await screen.findByText('Life Policy')
    fireEvent.click(screen.getByTestId('entity-page-new'))
    // Pre-selected to insurance → its fields show without any selection.
    expect(await screen.findByLabelText(/Death cover/)).toBeTruthy()
    // The Type dropdown is locked (disabled) on a single-subtype route.
    expect((screen.getByLabelText(/Type/) as HTMLButtonElement).disabled).toBe(true)
  })

  test('a new credit card defaults opening balance to 0; bank stays blank', async () => {
    renderPage(['bank', 'credit_card'])
    await screen.findByText('DBS Multiplier')
    fireEvent.click(screen.getByTestId('entity-page-new'))
    // Default type is bank → opening balance empty.
    const bankOpening = (await screen.findByPlaceholderText('0.00')) as HTMLInputElement
    expect(bankOpening.value).toBe('')
    // Switch to credit card → opening balance defaults to 0.
    fireEvent.click(screen.getByLabelText(/Type/))
    fireEvent.click(screen.getByRole('option', { name: 'Credit card' }))
    const ccOpening = (await screen.findByPlaceholderText('0.00')) as HTMLInputElement
    expect(ccOpening.value).toBe('0')
  })

  test('the reward-amount field adapts to reward_type (cashback % vs points)', async () => {
    renderPage(['bank', 'credit_card'])
    await screen.findByText('DBS Multiplier')
    fireEvent.click(screen.getByTestId('entity-page-new'))
    fireEvent.click(await screen.findByLabelText(/Type/))
    fireEvent.click(screen.getByRole('option', { name: 'Credit card' }))
    // No reward field until a reward_type is chosen.
    expect(screen.queryByLabelText(/Cashback rate/)).toBeNull()
    expect(screen.queryByLabelText(/Reward points/)).toBeNull()
    // cashback → the % field; points hidden.
    fireEvent.click(screen.getByLabelText(/Reward type/))
    fireEvent.click(screen.getByRole('option', { name: 'cashback' }))
    expect(await screen.findByLabelText(/Cashback rate/)).toBeTruthy()
    expect(screen.queryByLabelText(/Reward points/)).toBeNull()
    // points → the count field; cashback hidden.
    fireEvent.click(screen.getByLabelText(/Reward type/))
    fireEvent.click(screen.getByRole('option', { name: 'points' }))
    expect(await screen.findByLabelText(/Reward points/)).toBeTruthy()
    expect(screen.queryByLabelText(/Cashback rate/)).toBeNull()
  })

  test('saving a cashback card POSTs reward_rate and nulls reward_points', async () => {
    renderPage(['bank', 'credit_card'])
    await screen.findByText('DBS Multiplier')
    fireEvent.click(screen.getByTestId('entity-page-new'))
    fireEvent.click(await screen.findByLabelText(/Type/))
    fireEvent.click(screen.getByRole('option', { name: 'Credit card' }))
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: 'Cashback Card' } })
    fireEvent.click(screen.getByLabelText(/Reward type/))
    fireEvent.click(screen.getByRole('option', { name: 'cashback' }))
    fireEvent.change(await screen.findByLabelText(/Cashback rate/), { target: { value: '1.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const body = (api.post as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1] as Record<
      string,
      unknown
    >
    expect(body.reward_type).toBe('cashback')
    expect(body.reward_rate).toBe('1.5')
    expect(body.reward_points).toBeNull()
  })

  test('saving a points card sends reward_points and nulls reward_rate', async () => {
    renderPage(['bank', 'credit_card'])
    await screen.findByText('DBS Multiplier')
    fireEvent.click(screen.getByTestId('entity-page-new'))
    fireEvent.click(await screen.findByLabelText(/Type/))
    fireEvent.click(screen.getByRole('option', { name: 'Credit card' }))
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: 'Points Card' } })
    fireEvent.click(screen.getByLabelText(/Reward type/))
    fireEvent.click(screen.getByRole('option', { name: 'points' }))
    fireEvent.change(await screen.findByLabelText(/Reward points/), { target: { value: '5000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const body = (api.post as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1] as Record<
      string,
      unknown
    >
    expect(body.reward_points).toBe(5000)
    expect(body.reward_rate).toBeNull()
  })

  test('an out-of-range cashback rate (≥100) blocks Save', async () => {
    renderPage(['bank', 'credit_card'])
    await screen.findByText('DBS Multiplier')
    fireEvent.click(screen.getByTestId('entity-page-new'))
    fireEvent.click(await screen.findByLabelText(/Type/))
    fireEvent.click(screen.getByRole('option', { name: 'Credit card' }))
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: 'Bad Rate' } })
    fireEvent.click(screen.getByLabelText(/Reward type/))
    fireEvent.click(screen.getByRole('option', { name: 'cashback' }))
    fireEvent.change(await screen.findByLabelText(/Cashback rate/), { target: { value: '150' } })
    expect((screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('editing a points card to cashback nulls reward_points and PATCHes reward_rate', async () => {
    renderPage(['bank', 'credit_card'])
    await screen.findByText('Amex Platinum') // cc1 is reward_type 'points'
    const ccCard = screen
      .getAllByTestId('entity-card')
      .find((c) => c.textContent?.includes('Amex Platinum')) as HTMLElement
    fireEvent.click(within(ccCard).getByLabelText('Actions'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    await screen.findByText('Owners')
    // points field prefilled; switch to cashback.
    expect(screen.getByLabelText(/Reward points/)).toBeTruthy()
    fireEvent.click(screen.getByLabelText(/Reward type/))
    fireEvent.click(screen.getByRole('option', { name: 'cashback' }))
    fireEvent.change(await screen.findByLabelText(/Cashback rate/), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    const body = (api.patch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1] as Record<
      string,
      unknown
    >
    expect(body.reward_rate).toBe('3')
    expect(body.reward_points).toBeNull()
  })

  test('the create-only Current value field shows for asset-like, not bank/credit_card or on edit', async () => {
    // Capital create → present.
    renderPage(['capital'])
    await screen.findByText('Growth Fund')
    fireEvent.click(screen.getByTestId('entity-page-new'))
    expect(await screen.findByLabelText(/Current value/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' })) // close the create modal first
    // Editing a capital → absent (value history is the detail-view mini-ledger).
    fireEvent.click(screen.getAllByLabelText('Actions')[0])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    await screen.findByText('Owners')
    expect(screen.queryByLabelText(/Current value/)).toBeNull()
  })

  test('the Current value field is absent for a bank create', async () => {
    renderPage(['bank', 'credit_card'])
    await screen.findByText('DBS Multiplier')
    fireEvent.click(screen.getByTestId('entity-page-new'))
    await screen.findByLabelText(/Name/)
    expect(screen.queryByLabelText(/Current value/)).toBeNull()
  })

  test('a capital created with a Current value writes the first snapshot (POST)', async () => {
    vi.spyOn(api, 'post').mockImplementation((url: string) => {
      if (url === '/api/accounts') {
        return Promise.resolve({ data: { id: 'newcap', currency: 'SGD' }, status: 201 })
      }
      return Promise.resolve({ data: {}, status: 201 })
    })
    renderPage(['capital'])
    await screen.findByText('Growth Fund')
    fireEvent.click(screen.getByTestId('entity-page-new'))
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: 'New Fund' } })
    fireEvent.change(screen.getByLabelText(/Current value/), { target: { value: '50000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/accounts/newcap/snapshots',
        expect.objectContaining({ value: '50000', currency: 'SGD', source: 'manual' }),
      ),
    )
    // initial_value is never folded into the account create payload.
    const createBody = (api.post as unknown as { mock: { calls: unknown[][] } }).mock.calls.find(
      (c) => c[0] === '/api/accounts',
    )?.[1] as Record<string, unknown>
    expect('initial_value' in createBody).toBe(false)
  })

  test('the favourite star toggles → PUTs entity-preferences', async () => {
    renderPage(['bank', 'credit_card'])
    await screen.findByText('DBS Multiplier')
    const stars = screen.getAllByTestId('entity-card-favourite')
    fireEvent.click(stars[0])
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith(
        '/api/entity-preferences',
        expect.objectContaining({ entity_type: 'accounts', is_favourite: true }),
      ),
    )
  })

  test('favourited accounts sort to the front of the grid', async () => {
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
      if (url.startsWith('/api/entity-preferences')) {
        return Promise.resolve({
          data: {
            items: [{ entity_type: 'accounts', entity_id: 'cc1', is_favourite: true, sort_order: null }],
            total: 1,
          },
          status: 200,
        })
      }
      return Promise.resolve({ data: { items: accounts, total: accounts.length }, status: 200 })
    })
    renderPage(['bank', 'credit_card'])
    await screen.findByText('Amex Platinum')
    // cc1 (Amex) is favourited → first card, ahead of the default-first DBS Multiplier.
    const firstCard = screen.getAllByTestId('entity-card')[0]
    expect(firstCard.textContent).toContain('Amex Platinum')
  })
})
