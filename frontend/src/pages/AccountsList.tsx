import { useMemo, useState, type ReactNode } from 'react'
import { addMonths, format, getDaysInMonth, setDate } from 'date-fns'
import { useQuery } from '@tanstack/react-query'
import { Wallet, Pencil, Copy, Archive, RotateCcw, Trash2 } from 'lucide-react'
import { EntityPage } from '../components/entity'
import { EntityCard } from '../components/entity/EntityCard'
import { Dropdown } from '../components/primitives/Dropdown'
import { Icon } from '../components/primitives/Icon'
import { MiniSparkline } from '../components/primitives/MiniSparkline'
import { Avatar } from '../components/primitives/Avatar'
import { ConfirmationDialog } from '../components/primitives/ConfirmationDialog'
import type { ContextMenuEntry } from '../components/primitives'
import { useEntityManager } from '../hooks/useEntityManager'
import { useEntityPreferences } from '../hooks/useEntityPreferences'
import { useAlertStore } from '../stores/alertStore'
import { useAuthStore } from '../stores/authStore'
import { convertForDisplay } from '../lib/currency'
import { computeRoi } from '../lib/accountRoi'
import { semanticTextClass } from '../theme/semantic'
import { api, ApiError } from '../api/client'
import type { EntityListResponse } from '../types/entity'
import type { Currency } from '../types/currency'
import type { ListResponse, Member } from '../types/household'
import { ACCOUNT_TYPE_ICON, ACCOUNT_TYPE_LABEL } from '../config/accountIcons'
import { type Account, type AccountType } from '../types/account'
import { AccountModal } from './AccountModal'
import { AccountDetailView } from './AccountDetailView'

// The accounts list page (UX §1/§2/§2.5) — the locked EntityCard reference screen. ONE component,
// mounted at the four ACCOUNTS routes filtered by `subtypes` (/accounts=bank+credit, /capital,
// /assets, /insurance). Create/edit + the full lifecycle ⋮ set (Edit · Duplicate · — ·
// Archive/Restore · Delete-if-empty) are wired here. Tapping a card flips to the §8.2b read detail view
// (Story 4.11, AccountDetailView) — value snapshots are added/edited inline there now (the old
// Add-value-snapshot modal is retired). The hero is the computed current value in the active display
// currency (Story 4.9); the card carries the value-history MiniSparkline from its snapshot series
// (Story 4.5, presentational — the click→Viewer expand affordance is the Epic-9 seam).

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
  const [detailFor, setDetailFor] = useState<Account | null>(null)
  // The bank/credit-card type filter (UX §1.2) — only meaningful on the multi-subtype /accounts route.
  const [typeFilter, setTypeFilter] = useState<'all' | AccountType>('all')
  const pushToast = useAlertStore((s) => s.pushToast)
  // The active display lens (topbar picker, Story 4.9) — 'native' (default) or an ISO code; drives heroFor.
  const displayCurrency = useAuthStore((s) => s.currentPerson?.displayCurrency ?? 'native')

  const manager = useEntityManager<Account>({ entityType: 'accounts', basePath: '/api/accounts' })
  // Per-person favourites (FR-E-021) — the gold star renders + toggles + persists, favourites sort
  // first (UX §2.3). Accounts is the first real consumer of the entity_preferences contract.
  const { preferences: favourites, setFavourite } = useEntityPreferences('accounts')

  const currencyQuery = useQuery({
    queryKey: ['currencies'],
    queryFn: async () => (await api.get<EntityListResponse<Currency>>('/api/currencies')).data,
  })
  const currencies = useMemo(() => currencyQuery.data?.items ?? [], [currencyQuery.data])
  const base = currencies.find((c) => c.is_base)
  const baseCurrency = base?.code ?? 'SGD'
  // The modal currency picker + snapshot value picker offer the household's display-active codes,
  // with the base always available as the default (Story 4.4).
  const displayCurrencyCodes = useMemo(() => {
    const codes = currencies.filter((c) => c.is_display_active).map((c) => c.code)
    return codes.includes(baseCurrency) ? codes : [baseCurrency, ...codes]
  }, [currencies, baseCurrency])

  // Household members — resolves owner_ids → avatar/name for the card's stacked-owner cluster
  // (and the modal's picker, via the same query key — TanStack dedupes). Any member, read-only.
  const membersQuery = useQuery({
    queryKey: ['household', 'members'],
    queryFn: async () => (await api.get<ListResponse<Member>>('/api/household/members')).data,
  })
  const memberById = useMemo(
    () => new Map((membersQuery.data?.items ?? []).map((m) => [m.personId, m])),
    [membersQuery.data],
  )

  const subtypeSet = useMemo(() => new Set(subtypes), [subtypes])
  const q = search.trim().toLowerCase()
  const isFavourite = (a: Account) => favourites.get(a.id)?.is_favourite ?? false
  const visible = manager.items
    .filter((a) => {
      if (!subtypeSet.has(a.account_type)) return false
      if (typeFilter !== 'all' && a.account_type !== typeFilter) return false
      if (q && !a.name.toLowerCase().includes(q) && !(a.institution ?? '').toLowerCase().includes(q))
        return false
      return true
    })
    // Favourites first (UX §2.3); Array.prototype.sort is stable so ties keep the manager order.
    .sort((a, b) => Number(isFavourite(b)) - Number(isFavourite(a)))

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

  const sameSet = (a: string[], b: string[]) =>
    a.length === b.length && a.every((x) => b.includes(x))

  const handleSubmit = async (
    payload: Record<string, unknown>,
    id: string | null,
    ownerIds: string[],
    initialValue: string | null,
  ) => {
    try {
      if (id) {
        await manager.update(id, payload)
        // Owners aren't an `accounts` column — apply them via the dedicated PUT, only on a real diff.
        if (!sameSet(editing?.owner_ids ?? [], ownerIds)) {
          await api.put(`/api/accounts/${id}/owners`, { owner_ids: ownerIds })
          await manager.refetch()
        }
      } else {
        // Create folds owner_ids into the single POST (atomic — no created-but-ownerless window).
        const created = await manager.create({ ...payload, owner_ids: ownerIds })
        // Asset-like initial value (Story 4.12 AC4): write the first `manual` snapshot so the card
        // hero shows the value at once (asset-like value = latest snapshot, ARCH §3.11). Same POST
        // body as the detail-view add-row; snapshots are always the account's native currency. This
        // is a SECOND, non-atomic write: the account already exists, so a snapshot failure must NOT
        // look like a failed create (that invites a duplicate re-submit) — swallow it with a distinct
        // warning and still close the modal; the value can be set later in the detail-view ledger.
        if (initialValue) {
          try {
            await api.post(`/api/accounts/${created.id}/snapshots`, {
              snapshot_date: new Date().toISOString().slice(0, 10),
              value: initialValue,
              currency: created.currency,
              source: 'manual',
            })
            await manager.refetch()
          } catch (err) {
            toastError(err, 'Account created, but its starting value could not be set.')
          }
        }
      }
      setModalOpen(false)
    } catch (err) {
      toastError(err, 'Could not save the account.')
    }
  }

  // Stacked owner avatars (UX §2.1) — only on MULTI-owner accounts (avatars communicate sharing).
  // ponytail: shows up to 3 (2 + a +N chip when more); households are small so overflow is rare.
  const ownersSlot = (a: Account) => {
    if (a.owner_ids.length <= 1) return undefined
    const MAX = 3
    const showCount = a.owner_ids.length > MAX ? MAX - 1 : a.owner_ids.length
    const shown = a.owner_ids.slice(0, showCount)
    const overflow = a.owner_ids.length - shown.length
    return (
      <span className="flex items-center">
        {shown.map((id, i) => {
          const m = memberById.get(id)
          const name = m ? (m.displayName ?? m.email) : id
          return (
            <Avatar
              key={id}
              src={m?.pictureUrl ?? undefined}
              name={name}
              colour={m?.colour ?? undefined}
              size={20}
              className={`ring-2 ring-surface ${i > 0 ? '-ml-2xs' : ''}`}
            />
          )
        })}
        {overflow > 0 && (
          <span className="-ml-2xs flex size-5 items-center justify-center rounded-full bg-surface-active text-2xs text-text-secondary ring-2 ring-surface">
            +{overflow}
          </span>
        )}
      </span>
    )
  }

  const symbolFor = (code: string | null | undefined) =>
    currencies.find((c) => c.code === code)?.symbol ?? code ?? ''

  // The computed current value, rendered in the active display currency (Story 4.9). In Native mode
  // (the default) the value stays in its own currency; a chosen currency converts it display-only via
  // rate_to_base (the native code always stays in the card meta). `null` → '—'.
  const heroFor = (a: Account) => {
    if (a.current_value == null || a.current_value_currency == null) return '—'
    const { value, code } = convertForDisplay(
      a.current_value,
      a.current_value_currency,
      displayCurrency,
      currencies,
    )
    return `${symbolFor(code)} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  // The next future occurrence of a credit-card due day: this month if due_day ≥ today's day, else
  // next month; clamped to the target month's length (e.g. due_day 31 in a 30-day month → the 30th).
  // Rendered as a fixed short "d MMM" label (the bible "due 28 Jun"), NOT the per-person full format.
  // ponytail: short d-MMM label, not the per-person display format
  const nextDueDate = (day: number): string => {
    const today = new Date()
    const inThisMonth = day >= today.getDate()
    const month = inThisMonth ? today : addMonths(today, 1)
    return format(setDate(month, Math.min(day, getDaysInMonth(month))), 'd MMM')
  }

  // The card sub-line (Story 4.7) — bank: interest rate (· frequency) when set; credit card: the
  // computed due date + limit (bible #entitycard). The credit-card HERO stays the current value; the
  // red "Debt owing" hero is Epic 8 (FR-A-011). `undefined` → no sub-line.
  const subtitleFor = (a: Account): ReactNode => {
    if (a.account_type === 'bank') {
      if (a.interest_rate == null) return undefined
      const freq = a.interest_frequency ? ` · ${a.interest_frequency}` : ''
      return `${Number(a.interest_rate)}%${freq}`
    }
    if (a.account_type === 'credit_card') {
      const parts: string[] = []
      if (a.due_day != null) parts.push(`due ${nextDueDate(a.due_day)}`)
      if (a.credit_limit != null) {
        // Convert the limit to the active display currency (Story 4.11 pickup) — the hero already
        // converts; the sub-line must too, or a non-Native lens shows a mixed-currency card.
        const { value, code } = convertForDisplay(a.credit_limit, a.currency, displayCurrency, currencies)
        parts.push(`limit ${symbolFor(code)} ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`)
      }
      return parts.length ? parts.join(' · ') : undefined
    }
    if (a.account_type === 'capital') {
      // Derived ROI = current value − cost basis, both in native then shown in the display currency
      // (Story 4.8/4.11). The same-ccy guard is relaxed (Story 4.11): a cross-currency current value is
      // converted to native first, so ROI renders instead of being suppressed. Gain green / loss red;
      // on a vivid card fall back to the contrast pole (semantic colour breaks the pole on a fill).
      const roi = computeRoi(a, currencies, displayCurrency)
      if (!roi) return undefined
      const text = `ROI ${roi.delta < 0 ? '−' : '+'}${symbolFor(roi.code)} ${Math.abs(roi.delta).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      const tone = semanticTextClass(roi.delta === 0 ? null : roi.delta > 0 ? 'success' : 'error', a.vivid)
      return <span className={tone}>{text}</span>
    }
    if (a.account_type === 'insurance') {
      return a.policy_type ? `coverage · ${a.policy_type}` : undefined
    }
    return undefined
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

  // Tap a card → open the §8.2b read detail view.
  const openDetail = (a: Account) => setDetailFor(a)
  const closeDetail = () => setDetailFor(null)

  const renderCard = (a: Account) => (
    <EntityCard
      key={a.id}
      colour={a.colour ?? undefined}
      vivid={a.vivid}
      archived={a.status === 'archived'}
      icon={<Icon icon={ACCOUNT_TYPE_ICON[a.account_type]} size={18} />}
      name={a.name}
      hero={heroFor(a)}
      subtitle={subtitleFor(a)}
      sparkline={<MiniSparkline data={a.value_series.map(Number)} />}
      meta={`${ACCOUNT_TYPE_LABEL[a.account_type]} · ${a.currency}`}
      owners={ownersSlot(a)}
      favourite={isFavourite(a)}
      onToggleFavourite={() => {
        setFavourite(a.id, !isFavourite(a)).catch((err) =>
          toastError(err, 'Could not update the favourite.'),
        )
      }}
      menuItems={rowMenu(a)}
      onClick={() => openDetail(a)}
    />
  )

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
        {visible.map((a) => renderCard(a))}
      </EntityPage>

      <AccountModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        baseCurrency={baseCurrency}
        subtypes={subtypes}
        currencyOptions={displayCurrencyCodes}
        onSubmit={handleSubmit}
      />

      <AccountDetailView
        open={detailFor !== null}
        onClose={closeDetail}
        account={detailFor}
        currencies={currencies}
        displayCurrency={displayCurrency}
        onError={(err) => toastError(err, 'Could not save the snapshot.')}
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
