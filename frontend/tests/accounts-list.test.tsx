import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { AccountsList } from '../src/pages/AccountsList'
import type { Account } from '../src/types/account'
import type { Currency } from '../src/types/currency'
import { api } from '../src/api/client'

const currencies: Currency[] = [
  {
    id: 'sgd', code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', colour: null, vivid: false,
    is_base: true, is_display_active: true, rate_to_base: '1.0', fee_pct: '0',
    last_rate_at: null, rate_source: null, rate_history: [],
  },
]

const accounts: Account[] = [
  {
    id: 'b1', account_type: 'bank', name: 'DBS Multiplier', institution: 'DBS', notes: null,
    colour: '#6366f1', vivid: true, status: 'active', created_by: 'p1', updated_at: '2026-06-01T00:00:00',
    owner_ids: ['p1'], can_delete: true, delete_blocked_reason: null,
    opening_balance: '12840.0000', opening_balance_date: '2026-06-01',
    account_number: null, interest_rate: null, interest_frequency: null, reserved_amount: null,
  },
  {
    id: 'b2', account_type: 'bank', name: 'POSB Everyday', institution: 'POSB', notes: null,
    colour: null, vivid: false, status: 'active', created_by: 'p1', updated_at: '2026-06-01T00:00:00',
    owner_ids: ['p1'], can_delete: false, delete_blocked_reason: 'has transactions',
    opening_balance: '500.0000', opening_balance_date: '2026-06-01',
    account_number: null, interest_rate: null, interest_frequency: null, reserved_amount: null,
  },
  {
    id: 'c1', account_type: 'capital', name: 'Stocks', institution: null, notes: null,
    colour: null, vivid: false, status: 'active', created_by: 'p1', updated_at: '2026-06-01T00:00:00',
    owner_ids: ['p1'], can_delete: true, delete_blocked_reason: null,
    investment_type: null, cost_basis: '5000.0000',
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
  vi.spyOn(api, 'get').mockImplementation((url: string) => {
    if (url.startsWith('/api/currencies')) {
      return Promise.resolve({ data: { items: currencies, total: currencies.length }, status: 200 })
    }
    return Promise.resolve({ data: { items: accounts, total: accounts.length }, status: 200 })
  })
  vi.spyOn(api, 'post').mockResolvedValue({ data: {}, status: 201 })
  vi.spyOn(api, 'patch').mockResolvedValue({ data: {}, status: 200 })
  vi.spyOn(api, 'delete').mockResolvedValue({ data: undefined, status: 204 })
})
afterEach(() => vi.restoreAllMocks())

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
})
