import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { TransactionModal } from '../src/pages/TransactionModal'
import { api } from '../src/api/client'
import { useAuthStore } from '../src/stores/authStore'
import type { Person } from '../src/types/auth'
import type { Currency } from '../src/types/currency'
import type { Transaction } from '../src/types/event'

// TransactionModal edit mode (Story 5.3, AC2): seeded from a row, PATCH-shaped payload on Save.

const currencies: Currency[] = [
  {
    id: 'sgd', code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', colour: null, vivid: false,
    is_base: true, is_display_active: true, rate_to_base: '1.0', fee_pct: '0',
    last_rate_at: null, rate_source: null, rate_history: [],
  },
]

const row: Transaction = {
  id: 't-1', event_type: 'transaction', name: 'Team Lunch', event_date: '2026-06-10',
  transaction_status: 'completed', transaction_type: 'outflow', category_id: null,
  payee_person_id: null, payment_method: 'cash', source_account_id: null, is_shared_expense: true,
  is_gst_claimable: false, notes: null, source: 'manual', currency: 'SGD', amount: '42.50',
  fx_rate: '1', amount_base_calculated: '42.50', amount_base: '42.50', fx_delta: '0',
  fee_amount: null, fx_rate_date: null, created_by: 'me', updated_at: '2026-06-10T00:00:00',
  amount_base_source: 'spot', status: 'active',
}

function renderModal(onSubmit: (p: unknown) => Promise<void>, transaction: Transaction | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(
    <TransactionModal open onClose={() => {}} onSubmit={onSubmit} transaction={transaction} />,
    { wrapper },
  )
}

beforeEach(() => {
  useAuthStore.setState({ currentPerson: { personId: 'me', role: 'member' } as unknown as Person })
  vi.spyOn(api, 'get').mockImplementation((url: string) => {
    if (url.startsWith('/api/currencies')) {
      return Promise.resolve({ data: { items: currencies, total: 1 }, status: 200 })
    }
    // members / categories / accounts — empty is fine for this modal test.
    return Promise.resolve({ data: { items: [], total: 0 }, status: 200 })
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  useAuthStore.setState({ currentPerson: null })
})

describe('TransactionModal — edit mode (AC2)', () => {
  test('seeds the form from the row and PATCH-submits its values on Save', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderModal(onSubmit, row)

    // Edit-mode chrome: "Edit transaction" title + a "Save" (not "Add") button.
    expect(await screen.findByText('Edit transaction')).toBeInTheDocument()
    const nameInput = await screen.findByDisplayValue('Team Lunch')
    expect(nameInput).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const payload = onSubmit.mock.calls[0][0]
    // cleanAmount normalises the entered magnitude (trailing zero trimmed).
    expect(payload).toMatchObject({
      name: 'Team Lunch',
      transaction_type: 'outflow',
      currency: 'SGD',
      amount: '42.5',
    })
  })

  test('create mode shows "New transaction" + an "Add" button', async () => {
    renderModal(vi.fn(), null)
    expect(await screen.findByText('New transaction')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
  })

  // SCP 2026-07-02 — status is edit-mode only; `reconciled` is offered only on foreign rows.
  test('edit mode (foreign): status dropdown offers Reconciled + submits the status', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderModal(onSubmit, { ...row, currency: 'USD', transaction_status: 'completed' })

    expect(await screen.findByText('Edit transaction')).toBeInTheDocument()
    fireEvent.click(document.querySelector('#txn-status') as HTMLElement)
    expect(screen.getByText('Reconciled')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ transaction_status: 'completed' })
  })

  test('edit mode (base currency): Reconciled is not an offered status', async () => {
    renderModal(vi.fn(), { ...row, transaction_status: 'pending' })
    expect(await screen.findByText('Edit transaction')).toBeInTheDocument()
    fireEvent.click(document.querySelector('#txn-status') as HTMLElement)
    expect(screen.queryByText('Reconciled')).not.toBeInTheDocument()
  })

  test('create mode omits the status axis + renders no status control', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderModal(onSubmit, null)
    fireEvent.change(await screen.findByPlaceholderText('e.g. Groceries'), {
      target: { value: 'Coffee' },
    })
    fireEvent.change(document.querySelector('#txn-amount') as HTMLInputElement, {
      target: { value: '5' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('transaction_status')
    expect(document.querySelector('#txn-status')).toBeNull()
  })

  test('amount of 0 blocks Save; a positive amount submits', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderModal(onSubmit, null)

    fireEvent.change(await screen.findByPlaceholderText('e.g. Groceries'), {
      target: { value: 'Coffee' },
    })
    const amount = document.querySelector('#txn-amount') as HTMLInputElement
    fireEvent.change(amount, { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(screen.getByText(/required/i)).toBeInTheDocument())
    expect(onSubmit).not.toHaveBeenCalled()

    // A positive amount clears the block and submits.
    fireEvent.change(amount, { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ amount: '5' })
  })
})
