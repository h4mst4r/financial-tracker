import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Wallet, Pencil, Copy, Archive, RotateCcw, Trash2 } from 'lucide-react'
import { EntityPage } from '../components/entity'
import { EntityCard } from '../components/entity/EntityCard'
import { Dropdown } from '../components/primitives/Dropdown'
import { Icon } from '../components/primitives/Icon'
import { ConfirmationDialog } from '../components/primitives/ConfirmationDialog'
import type { ContextMenuEntry } from '../components/primitives'
import { useEntityManager } from '../hooks/useEntityManager'
import { useAlertStore } from '../stores/alertStore'
import { api, ApiError } from '../api/client'
import type { EntityListResponse } from '../types/entity'
import type { Currency } from '../types/currency'
import { ACCOUNT_TYPE_ICON, ACCOUNT_TYPE_LABEL } from '../config/accountIcons'
import { LEDGER_BACKED, type Account, type AccountType } from '../types/account'
import { AccountModal } from './AccountModal'

// The accounts list page (UX §1/§2/§2.5) — the locked EntityCard reference screen. ONE component,
// mounted at the four ACCOUNTS routes filtered by `subtypes` (/accounts=bank+credit, /capital,
// /assets, /insurance). Create/edit + the full lifecycle ⋮ set (Edit · Duplicate · — · Archive/
// Restore · Delete-if-empty, Story 4.2) are wired here. The value-history sparkline (Story 4.5) +
// per-account currency (Story 4.4) are deliberately out of scope — the hero is the opening balance
// for ledger-backed accounts, "—" for asset-like ones (their value comes from snapshots, Story 4.4).

interface AccountsListProps {
  subtypes: AccountType[]
  title: string
  /** Singular noun for the "+ New" button + empty state. */
  newLabel: string
}

// Minimal English pluraliser for the entity nouns used here (account → accounts, policy → policies).
const plural = (word: string) => (/[^aeiou]y$/.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`)

export function AccountsList({ subtypes, title, newLabel }: AccountsListProps) {
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Account | null>(null)
  const [confirmArchive, setConfirmArchive] = useState<Account | null>(null)
  // The bank/credit-card type filter (UX §1.2) — only meaningful on the multi-subtype /accounts route.
  const [typeFilter, setTypeFilter] = useState<'all' | AccountType>('all')
  const pushToast = useAlertStore((s) => s.pushToast)

  const manager = useEntityManager<Account>({ entityType: 'accounts', basePath: '/api/accounts' })

  const currencyQuery = useQuery({
    queryKey: ['currencies'],
    queryFn: async () => (await api.get<EntityListResponse<Currency>>('/api/currencies')).data,
  })
  const currencies = currencyQuery.data?.items ?? []
  const base = currencies.find((c) => c.is_base)
  const baseCurrency = base?.code ?? 'SGD'
  const baseSymbol = base?.symbol ?? baseCurrency

  const subtypeSet = useMemo(() => new Set(subtypes), [subtypes])
  const q = search.trim().toLowerCase()
  const visible = manager.items.filter((a) => {
    if (!subtypeSet.has(a.account_type)) return false
    if (typeFilter !== 'all' && a.account_type !== typeFilter) return false
    if (q && !a.name.toLowerCase().includes(q) && !(a.institution ?? '').toLowerCase().includes(q))
      return false
    return true
  })

  const toastError = (err: unknown, fallback: string) => {
    const detail = err instanceof ApiError ? err.details?.detail : undefined
    const message =
      typeof detail === 'string' ? detail : err instanceof ApiError ? err.message : fallback
    pushToast({ variant: 'error', message })
  }
  // Run a lifecycle mutation, toasting success/failure. A blocked delete (409 has_dependencies)
  // surfaces its RFC-7807 detail via toastError; the row stays.
  const runAction = async (fn: () => Promise<unknown>, fallback: string, success: string) => {
    try {
      await fn()
      pushToast({ variant: 'success', message: success })
    } catch (err) {
      toastError(err, fallback)
    }
  }

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }
  const openEdit = (a: Account) => {
    setEditing(a)
    setModalOpen(true)
  }

  const handleSubmit = async (payload: Record<string, unknown>, id: string | null) => {
    try {
      if (id) await manager.update(id, payload)
      else await manager.create(payload)
      setModalOpen(false)
    } catch (err) {
      toastError(err, 'Could not save the account.')
    }
  }

  const heroFor = (a: Account) => {
    if (LEDGER_BACKED.has(a.account_type) && 'opening_balance' in a && a.opening_balance != null) {
      const n = Number(a.opening_balance)
      return `${baseSymbol} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    return '—'
  }

  // The adaptive §8.1 ⋮ set: Edit · Duplicate · — · Archive/Restore · Delete-if-empty. Archive ↔
  // Restore by status; Delete is disabled with a reason when the server reports can_delete=false.
  const rowMenu = (a: Account): ContextMenuEntry[] => [
    { label: 'Edit', icon: Pencil, onClick: () => openEdit(a) },
    {
      label: 'Duplicate',
      icon: Copy,
      onClick: () =>
        runAction(() => manager.duplicate(a.id), 'Could not duplicate the account.', 'Account duplicated'),
    },
    { divider: true },
    a.status === 'archived'
      ? {
          label: 'Restore',
          icon: RotateCcw,
          onClick: () =>
            runAction(() => manager.restore(a.id), 'Could not restore the account.', 'Account restored'),
        }
      : { label: 'Archive', icon: Archive, onClick: () => setConfirmArchive(a) },
    {
      label: 'Delete',
      icon: Trash2,
      destructive: true,
      disabled: !a.can_delete,
      disabledReason: a.delete_blocked_reason ?? undefined,
      onClick: () => setConfirmDelete(a),
    },
  ]

  const typeFilterControl = subtypes.length > 1 && (
    <div className="w-account-filter">
      <Dropdown
        value={typeFilter}
        onChange={(v) => setTypeFilter(v as 'all' | AccountType)}
        options={[
          { value: 'all', label: 'All types' },
          ...subtypes.map((t) => ({ value: t, label: ACCOUNT_TYPE_LABEL[t] })),
        ]}
      />
    </div>
  )

  return (
    <div className="p-lg">
      <EntityPage
        title={title}
        info={`${visible.length} ${visible.length === 1 ? newLabel : plural(newLabel)}`}
        newLabel={newLabel}
        onNew={openCreate}
        search={search}
        onSearchChange={setSearch}
        view="grid"
        onViewChange={() => {}}
        hideViewToggle
        hideSort
        showArchived={manager.showArchived}
        onShowArchivedChange={manager.setShowArchived}
        filters={typeFilterControl}
        isLoading={manager.isLoading}
        isError={manager.isError}
        onRetry={manager.refetch}
        isEmpty={visible.length === 0}
        emptyIcon={Wallet}
        emptyTitle={`No ${plural(newLabel)} yet`}
        emptyDescription={`Add ${newLabel === 'account' ? 'an' : 'a'} ${newLabel} to start tracking it.`}
      >
        {visible.map((a) => (
          <EntityCard
            key={a.id}
            colour={a.colour ?? undefined}
            vivid={a.vivid}
            archived={a.status === 'archived'}
            icon={<Icon icon={ACCOUNT_TYPE_ICON[a.account_type]} size={18} />}
            name={a.name}
            hero={heroFor(a)}
            meta={`${ACCOUNT_TYPE_LABEL[a.account_type]} · ${baseCurrency}`}
            menuItems={rowMenu(a)}
            onClick={() => openEdit(a)}
          />
        ))}
      </EntityPage>

      <AccountModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        baseCurrency={baseCurrency}
        onSubmit={handleSubmit}
      />

      <ConfirmationDialog
        open={confirmArchive !== null}
        onClose={() => setConfirmArchive(null)}
        onConfirm={() => {
          if (confirmArchive)
            runAction(() => manager.archive(confirmArchive.id), 'Could not archive the account.', 'Account archived')
        }}
        title="Archive account"
        message={
          confirmArchive
            ? `Archive "${confirmArchive.name}"? It's hidden from lists and totals, but its history is kept.`
            : ''
        }
        confirmLabel="Archive"
      />

      <ConfirmationDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete)
            runAction(() => manager.deletePermanently(confirmDelete.id), 'Could not delete the account.', 'Account deleted')
        }}
        title="Delete account"
        message={
          confirmDelete ? `Permanently delete "${confirmDelete.name}"? This cannot be undone.` : ''
        }
        confirmLabel="Delete"
      />
    </div>
  )
}
