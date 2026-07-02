import { useId, useMemo, useState, type CSSProperties } from 'react'
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query'
import { Button } from '../components/primitives/Button'
import { Table, type CellEditContext, type ColumnDef, type SortState } from '../components/primitives/Table'
import { dateColumn, moneyColumn, categoryColumn } from '../components/primitives/tableColumns'
import { FilterBar, type FilterDescriptor, type FilterState } from '../components/primitives/FilterBar'
import { Badge } from '../components/primitives/Badge'
import { Dot } from '../components/primitives/Dot'
import { Avatar } from '../components/primitives/Avatar'
import { Dropdown } from '../components/primitives/Dropdown'
import { Input } from '../components/primitives/Input'
import { Toggle } from '../components/primitives/Toggle'
import { ContextMenu, type ContextMenuEntry } from '../components/primitives/ContextMenu'
import { Icon } from '../components/primitives/Icon'
import { MonetaryValue } from '../components/primitives/MonetaryValue'
import { DateValue } from '../components/primitives/DateValue'
import { EmptyState } from '../components/primitives/EmptyState'
import { EMPTY_STATE } from '../config/emptyStateRegistry'
import { badgeVariantForStatus, statusToneForStatus } from '../config/statusRegistry'
import { ACTION_ICON } from '../config/iconRegistry'
import { useAlertStore } from '../stores/alertStore'
import { useAuthStore } from '../stores/authStore'
import { api, ApiError } from '../api/client'
import { symbolForCode } from '../lib/currency'
import {
  applyCellEdit,
  buildEventQuery,
  canMutateRow,
  cellCommitPayload,
  isCellField,
  type CellField,
} from './transactionsQuery'
import type { EntityListResponse } from '../types/entity'
import type { Account } from '../types/account'
import type { Category } from '../types/category'
import type { Currency } from '../types/currency'
import type { ListResponse, Member } from '../types/household'
import type {
  Transaction,
  TransactionCreate,
  TransactionListPage,
  TransactionUpdate,
} from '../types/event'
import { TransactionModal, type TransactionSubmit } from './TransactionModal'
import { TransactionFlags } from './TransactionFlags'

// The Transactions ledger page (UX §12). AppShell (global) hosts the toolbar (name · server summary ·
// +New), the record-list FilterBar, and the RecordLedger `Table` with server-side sort + keyset
// pagination (ARCH §4.10) and the §12.6 responsive collapse (tablet folds Payer/method into the Name
// sub-line; < md → card/tx + sort Dropdown). Deferred to their stories: inline-edit persistence (5.3),
// quick-add (5.7), selection + BulkActionBar (5.8), ⋮ row actions (5.3), tags filter/chips (5.10),
// Visualize (Epic 9).

// The mobile sort affordance (< md, AC3) — the same three sortable dimensions as the desktop headers.
const SORT_OPTIONS = [
  { value: 'event_date:desc', label: 'Date (newest)' },
  { value: 'event_date:asc', label: 'Date (oldest)' },
  { value: 'amount:desc', label: 'Amount (high → low)' },
  { value: 'amount:asc', label: 'Amount (low → high)' },
  { value: 'amount_base:desc', label: 'Base (high → low)' },
  { value: 'amount_base:asc', label: 'Base (low → high)' },
]

// Display labels for the three settable transaction statuses (§4 registry keys on the wire values).
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  completed: 'Completed',
  reconciled: 'Reconciled',
  cancelled: 'Cancelled',
}

// Shared amount/base inline editor — the unsigned magnitude (mono, right-aligned). Amount + Base both
// reuse it; on commit the value maps to `amount` / `amount_base` (the latter = the FX manual override).
const amountEditControl = ({ value, setValue }: CellEditContext<Transaction>) => (
  <Input
    autoFocus
    inputMode="decimal"
    className="text-right font-mono"
    value={value}
    onChange={(e) => setValue(e.target.value)}
  />
)

export function Transactions() {
  const [modalOpen, setModalOpen] = useState(false)
  // Edit mode carries the row being edited (null = create); duplicate opens the modal on its clone.
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [filterState, setFilterState] = useState<FilterState>({})
  const [sort, setSort] = useState<SortState | null>(null)
  // Toolbar Archived toggle (mirrors Accounts/EntityPage) — surfaces archived rows so they can be
  // reached for ⋮ Restore. Part of the ledger query key so flipping it refetches.
  const [showArchived, setShowArchived] = useState(false)
  const archivedToggleId = useId()
  const pushToast = useAlertStore((s) => s.pushToast)
  const queryClient = useQueryClient()
  const currentPerson = useAuthStore((s) => s.currentPerson)

  // Per-row permission (AC3, ARCH §1795-1800): a Member acts only on rows they created; Admin/Owner
  // on any. Gates both the inline editors (canEditRow) and the ⋮ menu.
  const canMutate = (t: Transaction): boolean => canMutateRow(currentPerson, t)

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
  const members = useMemo(() => membersQuery.data?.items ?? [], [membersQuery.data])
  const memberById = useMemo(() => new Map(members.map((m) => [m.personId, m])), [members])

  const categoryQuery = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<EntityListResponse<Category>>('/api/categories')).data,
  })
  const categories = useMemo(() => categoryQuery.data?.items ?? [], [categoryQuery.data])
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  const accountQuery = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => (await api.get<EntityListResponse<Account>>('/api/accounts')).data,
  })
  const accounts = useMemo(() => accountQuery.data?.items ?? [], [accountQuery.data])
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  // The ledger: a consumer-owned useInfiniteQuery over the keyset endpoint (Table never fetches — it
  // only signals near-bottom). Filters + sort are in the key, so changing either refetches from page 1.
  const ledgerKey = ['events', 'ledger', filterState, sort, showArchived] as const
  const ledger = useInfiniteQuery({
    queryKey: ledgerKey,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const qs = buildEventQuery(filterState, sort, pageParam, showArchived)
      return (await api.get<TransactionListPage>(`/api/events${qs ? `?${qs}` : ''}`)).data
    },
    getNextPageParam: (last) => last.next_cursor,
  })
  const rows = useMemo(
    () => ledger.data?.pages.flatMap((p) => p.items) ?? [],
    [ledger.data],
  )
  // total + summary come from the server (the toolbar aggregate is over the full filtered set, never
  // client-summed over a paginated page — ARCH lines 1779-1783).
  const firstPage = ledger.data?.pages[0]
  const total = firstPage?.total ?? 0
  const summary = firstPage?.summary ?? { out: '0', inflow: '0' }

  // A signed amount string so MonetaryValue tints outflow red / inflow green (§12.1 signColour).
  const signed = (t: Transaction, value: string) =>
    t.transaction_type === 'outflow' ? `-${value}` : value

  // The method sub-line label — the paying account's name, or "Cash", or the raw method.
  const methodLabel = (t: Transaction): string | null => {
    if (t.source_account_id) return accountById.get(t.source_account_id)?.name ?? null
    if (t.payment_method === 'cash') return 'Cash'
    return t.payment_method
  }
  const payerName = (t: Transaction): string | null =>
    t.payee_person_id ? (memberById.get(t.payee_person_id)?.displayName ?? null) : null

  const filterDescriptors: FilterDescriptor[] = useMemo(
    () => [
      { key: 'search', label: 'Search', control: 'search', placeholder: 'Search transactions…', primary: true },
      { key: 'dateRange', label: 'Date', control: 'dateRange', primary: true, toVizField: 'time_range' },
      {
        key: 'category',
        label: 'Category',
        control: 'dropdown',
        primary: true,
        searchable: true,
        placeholder: 'Category',
        toVizField: 'category_ids',
        options: categories.map((c) => ({ value: c.id, label: c.name })),
      },
      {
        key: 'type',
        label: 'Type',
        control: 'segmented',
        primary: true,
        toVizField: 'transaction_type',
        options: [
          { value: 'all', label: 'All' },
          { value: 'inflow', label: 'Inflow' },
          { value: 'outflow', label: 'Outflow' },
        ],
      },
      {
        key: 'account',
        label: 'Account',
        control: 'dropdown',
        searchable: true,
        toVizField: 'account_ids',
        options: accounts.map((a) => ({ value: a.id, label: a.name })),
      },
      {
        key: 'person',
        label: 'Person',
        control: 'dropdown',
        toVizField: 'person_ids',
        options: members.map((m) => ({ value: m.personId, label: m.displayName ?? m.email })),
      },
      {
        key: 'status',
        label: 'Status',
        control: 'dropdown',
        options: [
          { value: 'completed', label: 'Completed' },
          { value: 'pending', label: 'Pending' },
          { value: 'cancelled', label: 'Cancelled' },
        ],
      },
      {
        key: 'gst',
        label: 'GST',
        control: 'dropdown',
        options: [
          { value: 'claimable', label: 'Claimable' },
          { value: 'not', label: 'Not claimable' },
        ],
      },
      {
        key: 'reconciled',
        label: 'Reconciled',
        control: 'dropdown',
        options: [
          { value: 'yes', label: 'Reconciled' },
          { value: 'no', label: 'Unreconciled' },
        ],
      },
    ],
    // Tags filter is Story 5.10 (no tag entity until 5.9) — intentionally absent.
    [categories, accounts, members],
  )

  // Inline-edit option lists (reused by the picker editControls) — mirror the modal's shapes.
  const currencyCodes = useMemo(() => currencies.map((c) => c.code), [currencies])
  const categoryEditOptions = useMemo(
    () =>
      categories.map((c) => ({
        value: c.id,
        searchText: c.name,
        label: (
          <span className="inline-flex items-center gap-2xs" style={{ '--entity-colour': c.color } as CSSProperties}>
            <Dot color={c.color} />
            <span className="text-entity-fg">{c.name}</span>
          </span>
        ),
      })),
    [categories],
  )
  const memberEditOptions = useMemo(
    () =>
      members.map((m) => ({
        value: m.personId,
        label: (
          <span className="inline-flex items-center gap-2xs">
            <Avatar src={m.pictureUrl ?? undefined} name={m.displayName ?? m.email} colour={m.colour ?? undefined} size={20} />
            <span>{m.displayName ?? m.email}</span>
          </span>
        ),
      })),
    [members],
  )

  const columns: ColumnDef<Transaction>[] = [
    dateColumn<Transaction>({ key: 'event_date', get: (t) => t.event_date, width: '8rem', editable: true }),
    {
      key: 'name',
      header: 'Name',
      align: 'left',
      width: '15rem',
      editable: true,
      editInitial: (t) => t.name ?? '',
      editControl: ({ value, setValue }) => (
        <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
      ),
      // Name + a muted sub-line (method / notes). The payer folds INTO the sub-line only < lg (where
      // the Payer column hides) — at ≥ lg the Payer has its own column, so it stays out of the sub-line.
      render: (t) => {
        const method = methodLabel(t)
        const payer = payerName(t)
        const sub = [method, t.notes].filter(Boolean).join(' · ')
        return (
          <div className="flex flex-col">
            {/* Name + the behavioural-flag icon cluster (Story 5.5, §751): personal (non-shared
                outflow) + GST-claimable render as muted aria-labelled glyphs trailing the name. */}
            <span className="inline-flex min-w-0 items-center gap-2xs">
              <span className="truncate">{t.name ?? '—'}</span>
              <TransactionFlags transaction={t} />
            </span>
            {(sub || payer) && (
              <span className="truncate text-2xs text-text-muted">
                {payer && <span className="lg:hidden">{payer}{sub ? ' · ' : ''}</span>}
                {sub}
              </span>
            )}
          </div>
        )
      },
    },
    {
      key: 'payee',
      header: 'Payer',
      align: 'left',
      width: '10rem',
      hideBelow: 'lg',
      editable: true,
      editInitial: (t) => t.payee_person_id ?? '',
      editControl: ({ row, commit }) => (
        <Dropdown value={row.payee_person_id ?? ''} options={memberEditOptions} onChange={(v) => commit(v)} />
      ),
      render: (t) => {
        const m = t.payee_person_id ? memberById.get(t.payee_person_id) : undefined
        if (!m) return <span className="text-text-muted">—</span>
        return (
          <span className="inline-flex items-center gap-2xs">
            <Avatar src={m.pictureUrl ?? undefined} name={m.displayName ?? m.email} colour={m.colour ?? undefined} size={20} />
            <span className="truncate">{m.displayName ?? m.email}</span>
          </span>
        )
      },
    },
    {
      ...categoryColumn<Transaction>({
        get: (t) => {
          const c = t.category_id ? categoryById.get(t.category_id) : undefined
          return c ? { name: c.name, color: c.color } : null
        },
        width: '10rem',
      }),
      editable: true,
      editInitial: (t) => t.category_id ?? '',
      editControl: ({ row, commit }) => (
        <Dropdown value={row.category_id ?? ''} options={categoryEditOptions} onChange={(v) => commit(v)} searchable />
      ),
    },
    {
      key: 'currency',
      header: 'Currency',
      align: 'left',
      width: '6rem',
      editable: true,
      editInitial: (t) => t.currency,
      editControl: ({ row, commit }) => (
        <Dropdown
          value={row.currency}
          options={currencyCodes.map((code) => ({ value: code, label: code }))}
          onChange={(v) => commit(v)}
        />
      ),
      render: (t) => <Badge variant="outline">{t.currency}</Badge>,
    },
    {
      // Display shows the signed figure (signColour tints out/in); the editor works the UNSIGNED
      // magnitude — the sign is derived from transaction_type, never stored on `amount`.
      ...moneyColumn<Transaction>({
        key: 'amount',
        header: 'Amount',
        get: (t) => signed(t, t.amount),
        currencyOf: (t) => t.currency,
        symbolOf: (t) => symbolForCode(t.currency, currencies),
        signColour: true,
        width: '9rem',
      }),
      editable: true,
      editInitial: (t) => t.amount,
      editControl: amountEditControl,
    },
    {
      // Editing Base = the FX manual override (amount_base → manual, §12.7). Editor works the
      // unsigned base magnitude.
      ...moneyColumn<Transaction>({
        key: 'amount_base',
        header: `Base (${baseCurrency})`,
        get: (t) => signed(t, t.amount_base),
        currencyOf: () => baseCurrency,
        symbolOf: () => symbolForCode(baseCurrency, currencies),
        signColour: true,
        width: '9rem',
      }),
      editable: true,
      editInitial: (t) => t.amount_base,
      editControl: amountEditControl,
    },
    {
      key: 'status',
      header: 'Status',
      align: 'left',
      width: '9rem',
      sortable: false,
      // Status is a §4 `Badge` (status variant + leading dot, UX §751) — tone from the registry,
      // never a call-site colour. `reconciled` is a foreign-only status (success-green, SCP 2026-07-02).
      render: (t) => (
        <Badge variant={badgeVariantForStatus('transaction', t.transaction_status)} dot>
          {STATUS_LABEL[t.transaction_status] ?? t.transaction_status}
        </Badge>
      ),
    },
    {
      // ⋮ row-action menu (Edit / Duplicate / Archive|Restore) — trailing column per §751. Rendered
      // only when the current person may mutate the row (AC3): a Member sees no ⋮ on others' rows.
      key: '__actions',
      header: '',
      align: 'right',
      width: '2.5rem',
      sortable: false,
      render: (t) =>
        canMutate(t) ? (
          <ContextMenu
            trigger={<Icon icon={ACTION_ICON.more} size={14} className="text-text-muted opacity-60 hover:opacity-100" />}
            items={rowMenu(t)}
          />
        ) : null,
    },
  ]

  // < md card (one per transaction) — reuses the same atoms as the row (a Transaction is an
  // EntityCard-style surface on mobile, §composite). No new component.
  const renderCard = (t: Transaction) => {
    const c = t.category_id ? categoryById.get(t.category_id) : undefined
    return (
      <div className="flex flex-col gap-2xs border-b border-border px-sm py-control">
        <div className="flex items-center justify-between gap-sm">
          {/* Name + flag icons (Story 5.5, §751) — same cluster as the desktop row, on the card. */}
          <span className="inline-flex min-w-0 items-center gap-2xs">
            <span className="truncate font-medium text-text-strong">{t.name ?? '—'}</span>
            <TransactionFlags transaction={t} />
          </span>
          <MonetaryValue
            amount={signed(t, t.amount)}
            currency={t.currency}
            symbol={symbolForCode(t.currency, currencies)}
            variant="columnar"
            signColour
          />
        </div>
        <div className="flex items-center justify-between gap-sm text-2xs text-text-muted">
          <span className="inline-flex items-center gap-xs">
            <Dot tone={statusToneForStatus('transaction', t.transaction_status)} />
            <DateValue iso={t.event_date} />
            {c && <Badge entityColor={c.color}>{c.name}</Badge>}
          </span>
          <span>
            {symbolForCode(baseCurrency, currencies)} {t.amount_base}
          </span>
        </div>
      </div>
    )
  }

  const errorMessage = (err: unknown, fallback: string): string => {
    const detail = err instanceof ApiError ? err.details?.detail : undefined
    return typeof detail === 'string' ? detail : err instanceof ApiError ? err.message : fallback
  }

  const createMutation = useMutation({
    mutationFn: async (payload: TransactionCreate) =>
      (await api.post<Transaction>('/api/events', payload)).data,
  })
  const patchMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TransactionUpdate }) =>
      (await api.patch<Transaction>(`/api/events/${id}`, data)).data,
  })

  const handleSubmit = async (payload: TransactionSubmit) => {
    try {
      if (editing) {
        await patchMutation.mutateAsync({ id: editing.id, data: payload })
      } else {
        await createMutation.mutateAsync(payload)
      }
      await queryClient.invalidateQueries({ queryKey: ['events'] })
      pushToast({ variant: 'success', message: editing ? 'Transaction updated' : 'Transaction added' })
      setModalOpen(false)
      setEditing(null)
    } catch (err) {
      pushToast({ variant: 'error', message: errorMessage(err, 'Could not save transaction') })
    }
  }

  // Inline cell commit: optimistically patch the cached row, PATCH, reconcile server-derived fields
  // on success (amount edits recompute base FX), roll back + toast on failure (ARCH §4.10 — optimism
  // + rollback live HERE, never in Table). AC1.
  const handleCellCommit = async (row: Transaction, key: string, value: string) => {
    if (!isCellField(key)) return
    const field = key as CellField
    const previous = queryClient.getQueryData<InfiniteData<TransactionListPage>>(ledgerKey)
    queryClient.setQueryData<InfiniteData<TransactionListPage>>(ledgerKey, (old) =>
      old
        ? {
            ...old,
            pages: old.pages.map((p) => ({
              ...p,
              items: p.items.map((it) =>
                it.id === row.id ? applyCellEdit(it, field, value) : it,
              ),
            })),
          }
        : old,
    )
    try {
      await api.patch(`/api/events/${row.id}`, cellCommitPayload(field, value))
      await queryClient.invalidateQueries({ queryKey: ['events'] })
    } catch (err) {
      if (previous) queryClient.setQueryData(ledgerKey, previous)
      pushToast({ variant: 'error', message: errorMessage(err, 'Could not save change') })
    }
  }

  // ⋮ row actions (AC2/AC4/AC5). Archive removes the row from the default list on refetch; Duplicate
  // POSTs the clone then opens the modal on it to finish the amount/date (AC4).
  const openEdit = (t: Transaction) => {
    setEditing(t)
    setModalOpen(true)
  }
  const rowAction = async (id: string, path: string, ok: string, fail: string): Promise<Transaction | null> => {
    try {
      const res = await api.post<Transaction>(`/api/events/${id}/${path}`)
      await queryClient.invalidateQueries({ queryKey: ['events'] })
      pushToast({ variant: 'success', message: ok })
      return res.data
    } catch (err) {
      pushToast({ variant: 'error', message: errorMessage(err, fail) })
      return null
    }
  }
  const handleDuplicate = async (t: Transaction) => {
    const clone = await rowAction(t.id, 'duplicate', 'Transaction duplicated', 'Could not duplicate')
    if (clone) openEdit(clone)
  }
  const rowMenu = (t: Transaction): ContextMenuEntry[] => [
    { label: 'Edit', icon: ACTION_ICON.edit, onClick: () => openEdit(t) },
    { label: 'Duplicate', icon: ACTION_ICON.duplicate, onClick: () => void handleDuplicate(t) },
    t.status === 'archived'
      ? {
          label: 'Restore',
          icon: ACTION_ICON.restore,
          onClick: () => void rowAction(t.id, 'restore', 'Transaction restored', 'Could not restore'),
        }
      : {
          label: 'Archive',
          icon: ACTION_ICON.archive,
          onClick: () => void rowAction(t.id, 'archive', 'Transaction archived', 'Could not archive'),
        },
  ]

  const sortValue = sort ? `${sort.key}:${sort.dir}` : ''

  return (
    <div className="flex flex-col gap-md">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div>
          <h3 className="text-lg font-semibold text-text-strong">Transactions</h3>
          <div className="flex items-center gap-xs text-sm text-text-default">
            <span>{total} txns</span>
            <span aria-hidden>·</span>
            <MonetaryValue amount={summary.out} currency={baseCurrency} symbol={symbolForCode(baseCurrency, currencies)} /> out
            <span aria-hidden>·</span>
            <MonetaryValue amount={summary.inflow} currency={baseCurrency} symbol={symbolForCode(baseCurrency, currencies)} /> in
          </div>
        </div>
        <div className="flex items-center gap-sm">
          <label
            htmlFor={archivedToggleId}
            className="inline-flex items-center gap-xs text-sm text-text-default"
          >
            <Toggle id={archivedToggleId} checked={showArchived} onChange={setShowArchived} />
            Archived
          </label>
          <Button
            onClick={() => {
              setEditing(null)
              setModalOpen(true)
            }}
          >
            + New transaction
          </Button>
        </div>
      </div>

      <FilterBar descriptors={filterDescriptors} value={filterState} onChange={setFilterState} />

      {/* Mobile sort affordance — the desktop sortable headers are hidden in card mode (< md). */}
      <div className="md:hidden">
        <Dropdown
          value={sortValue}
          options={SORT_OPTIONS}
          placeholder="Sort by…"
          onChange={(v) => {
            if (!v) return setSort(null)
            const [key, dir] = v.split(':')
            setSort({ key, dir: dir as SortState['dir'] })
          }}
        />
      </div>

      <Table<Transaction>
        columns={columns}
        rows={rows}
        rowKey={(t) => t.id}
        loading={ledger.isLoading}
        sort={sort}
        onSortChange={setSort}
        renderCard={renderCard}
        inlineEdit
        canEditRow={canMutate}
        onCellCommit={handleCellCommit}
        virtualized
        infinite={{
          hasNextPage: !!ledger.hasNextPage,
          isFetchingNextPage: ledger.isFetchingNextPage,
          fetchNextPage: () => ledger.fetchNextPage(),
        }}
        emptyContent={
          <EmptyState title={EMPTY_STATE.transactions.title} description={EMPTY_STATE.transactions.description} />
        }
      />

      <TransactionModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setEditing(null)
        }}
        onSubmit={handleSubmit}
        transaction={editing}
      />
    </div>
  )
}
