import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Wallet, Pencil } from 'lucide-react'
import { EntityPage } from '../components/entity'
import { EntityCard } from '../components/entity/EntityCard'
import { Dropdown } from '../components/primitives/Dropdown'
import { Icon } from '../components/primitives/Icon'
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
// /assets, /insurance). Create + edit are wired here (the ⋮ menu is Edit-only this story; archive/
// delete/duplicate = Story 4.2). The value-history sparkline (Story 4.5) + per-account currency
// (Story 4.4) are deliberately out of scope — the hero is the opening balance for ledger-backed
// accounts, "—" for asset-like ones (their value comes from snapshots, Story 4.4).

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

  const rowMenu = (a: Account): ContextMenuEntry[] => [
    { label: 'Edit', icon: Pencil, onClick: () => openEdit(a) },
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
        hideArchived
        showArchived={false}
        onShowArchivedChange={() => {}}
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
    </div>
  )
}
