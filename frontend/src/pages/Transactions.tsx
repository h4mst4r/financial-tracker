import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '../components/primitives/Button'
import { Table, type ColumnDef } from '../components/primitives/Table'
import { dateColumn, textColumn, moneyColumn } from '../components/primitives/tableColumns'
import { Badge } from '../components/primitives/Badge'
import { Dot } from '../components/primitives/Dot'
import { Avatar } from '../components/primitives/Avatar'
import { MonetaryValue } from '../components/primitives/MonetaryValue'
import { EmptyState } from '../components/primitives/EmptyState'
import { EMPTY_STATE } from '../config/emptyStateRegistry'
import { statusToneForStatus } from '../config/statusRegistry'
import { useEntityManager } from '../hooks/useEntityManager'
import { useAlertStore } from '../stores/alertStore'
import { api, ApiError } from '../api/client'
import { symbolForCode } from '../lib/currency'
import type { EntityListResponse } from '../types/entity'
import type { Category } from '../types/category'
import type { Currency } from '../types/currency'
import type { ListResponse, Member } from '../types/household'
import type { Transaction, TransactionCreate } from '../types/event'
import { TransactionModal } from './TransactionModal'

// The Transactions ledger page (UX Transactions §12): AppShell (global) + toolbar (name · info ·
// +New) + the record-ledger `Table` (Story 5.0a). Story 5.1 renders the ledger READ-ONLY — the
// FilterBar, sortable-header interaction, inline cell edit, responsive column-folding and sticky
// quick-add row are all Story 5.2. This page's job is "a created transaction appears in the ledger".

export function Transactions() {
  const [modalOpen, setModalOpen] = useState(false)
  const pushToast = useAlertStore((s) => s.pushToast)
  const manager = useEntityManager<Transaction>({ entityType: 'events', basePath: '/api/events' })

  const currencyQuery = useQuery({
    queryKey: ['currencies'],
    queryFn: async () => (await api.get<EntityListResponse<Currency>>('/api/currencies')).data,
  })
  const currencies = useMemo(() => currencyQuery.data?.items ?? [], [currencyQuery.data])
  const baseCurrency = currencies.find((c) => c.is_base)?.code ?? 'SGD'

  const membersQuery = useQuery({
    queryKey: ['household', 'members'],
    queryFn: async () => (await api.get<ListResponse<Member>>('/api/household/members')).data,
  })
  const memberById = useMemo(
    () => new Map((membersQuery.data?.items ?? []).map((m) => [m.personId, m])),
    [membersQuery.data],
  )

  const categoryQuery = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<EntityListResponse<Category>>('/api/categories')).data,
  })
  const categoryById = useMemo(
    () => new Map((categoryQuery.data?.items ?? []).map((c) => [c.id, c])),
    [categoryQuery.data],
  )

  const rows = manager.items

  // Toolbar info — "{n} txns · {out} out · {in} in (base)".
  const totals = useMemo(() => {
    let out = 0
    let inflow = 0
    for (const t of rows) {
      const b = Number(t.amount_base)
      if (t.transaction_type === 'outflow') out += b
      else if (t.transaction_type === 'inflow') inflow += b
    }
    return { out, inflow }
  }, [rows])

  const columns: ColumnDef<Transaction>[] = [
    dateColumn<Transaction>({ key: 'event_date', get: (t) => t.event_date, width: '8rem' }),
    textColumn<Transaction>({ key: 'name', header: 'Name', get: (t) => t.name ?? '—' }),
    {
      key: 'payee',
      header: 'Payer',
      align: 'left',
      width: '10rem',
      render: (t) => {
        const m = t.payee_person_id ? memberById.get(t.payee_person_id) : undefined
        if (!m) return <span className="text-text-muted">—</span>
        return (
          <span className="inline-flex items-center gap-2xs">
            <Avatar src={m.pictureUrl ?? undefined} name={m.displayName ?? m.email} colour={m.colour ?? undefined} size={20} />
            <span>{m.displayName ?? m.email}</span>
          </span>
        )
      },
    },
    {
      key: 'category',
      header: 'Category',
      align: 'left',
      width: '9rem',
      render: (t) => {
        const c = t.category_id ? categoryById.get(t.category_id) : undefined
        return c ? <Badge>{c.name}</Badge> : <span className="text-text-muted">—</span>
      },
    },
    {
      key: 'currency',
      header: 'Currency',
      align: 'left',
      width: '6rem',
      render: (t) => <Badge variant="outline">{t.currency}</Badge>,
    },
    moneyColumn<Transaction>({
      key: 'amount',
      header: 'Amount',
      // Sign by direction so outflow tints red / inflow green (§12.1 signColour).
      get: (t) => (t.transaction_type === 'outflow' ? `-${t.amount}` : t.amount),
      currencyOf: (t) => t.currency,
      symbolOf: (t) => symbolForCode(t.currency, currencies),
      signColour: true,
      width: '9rem',
    }),
    moneyColumn<Transaction>({
      key: 'amount_base',
      header: `Base (${baseCurrency})`,
      // Sign the base by direction so it carries the in/out colour like Amount (§12.1 signColour).
      get: (t) => (t.transaction_type === 'outflow' ? `-${t.amount_base}` : t.amount_base),
      currencyOf: () => baseCurrency,
      symbolOf: () => symbolForCode(baseCurrency, currencies),
      signColour: true,
      width: '9rem',
    }),
    {
      key: 'status',
      header: 'Status',
      align: 'left',
      width: '7rem',
      // Status is a colour Dot (UX line 745 "StatusBadge dot"), tone from the §4 registry — never a
      // call-site colour. The status text stays available to assistive tech + on hover.
      render: (t) => (
        <span className="inline-flex items-center" title={t.transaction_status}>
          <Dot tone={statusToneForStatus('transaction', t.transaction_status)} />
          <span className="sr-only">{t.transaction_status}</span>
        </span>
      ),
    },
  ]

  const handleSubmit = async (payload: TransactionCreate) => {
    try {
      await manager.create(payload)
      pushToast({ variant: 'success', message: 'Transaction added' })
      setModalOpen(false)
    } catch (err) {
      const detail = err instanceof ApiError ? err.details?.detail : undefined
      const message =
        typeof detail === 'string' ? detail : err instanceof ApiError ? err.message : 'Could not add transaction'
      pushToast({ variant: 'error', message })
    }
  }

  return (
    // Interim page gutter matching the Accounts convention (AccountsList p-lg). The shared
    // AppShell-owns-`--page-gutter` refactor is the deferred correct-course item.
    <div className="flex flex-col gap-md p-lg">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div>
          <h3 className="text-lg font-semibold text-text-strong">Transactions</h3>
          <div className="flex items-center gap-xs text-sm text-text-default">
            <span>{manager.total} txns</span>
            <span aria-hidden>·</span>
            <MonetaryValue amount={String(totals.out)} currency={baseCurrency} symbol={symbolForCode(baseCurrency, currencies)} /> out
            <span aria-hidden>·</span>
            <MonetaryValue amount={String(totals.inflow)} currency={baseCurrency} symbol={symbolForCode(baseCurrency, currencies)} /> in
          </div>
        </div>
        <Button onClick={() => setModalOpen(true)}>+ New transaction</Button>
      </div>

      <Table<Transaction>
        columns={columns}
        rows={rows}
        rowKey={(t) => t.id}
        loading={manager.isLoading}
        emptyContent={
          <EmptyState title={EMPTY_STATE.transactions.title} description={EMPTY_STATE.transactions.description} />
        }
      />

      <TransactionModal open={modalOpen} onClose={() => setModalOpen(false)} onSubmit={handleSubmit} />
    </div>
  )
}
