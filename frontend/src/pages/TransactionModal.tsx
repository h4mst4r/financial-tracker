import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { EntityModal } from '../components/entity'
import { Label } from '../components/primitives/Label'
import { Input } from '../components/primitives/Input'
import { Dropdown } from '../components/primitives/Dropdown'
import { Checkbox } from '../components/primitives/Checkbox'
import { DatePicker } from '../components/primitives/DatePicker'
import { SegmentedControl } from '../components/primitives/SegmentedControl'
import { MonetaryValueInput } from '../components/primitives/MonetaryValueInput'
import { MonetaryValue } from '../components/primitives/MonetaryValue'
import { Badge } from '../components/primitives/Badge'
import { Avatar } from '../components/primitives/Avatar'
import { Dot } from '../components/primitives/Dot'
import { Icon } from '../components/primitives/Icon'
import { ACCOUNT_TYPE_ICON } from '../config/accountIcons'
import {
  BADGE_VARIANT_FOR_TONE,
  statusTone,
  type StatusTone,
} from '../config/statusRegistry'
import { api } from '../api/client'
import { cleanAmount, displayRate, symbolForCode } from '../lib/currency'
import { useAuthStore } from '../stores/authStore'
import type { EntityListResponse } from '../types/entity'
import type { Account } from '../types/account'
import type { Category } from '../types/category'
import type { Currency } from '../types/currency'
import type { ListResponse, Member } from '../types/household'
import type { TransactionCreate } from '../types/event'

// The transaction create surface (UX Transactions §12, money block line 749). `EntityModal` + the FX
// money block: entered amount/currency → spot base fill (`amount × rate_to_base`) with an optional
// bank-statement override. The FX-source indicator (spot/manual — formula is an Epic-7 seam) renders
// as the Base input's BORDER tone + a tag, resolved through the §4 `fxBaseSource` registry (never a
// call-site colour). When the entered currency IS the base currency the whole FX block collapses.
// Tags (5.10) / duplicate-detection (5.6) / status+reconciliation (5.4) are out of scope here.

const TODAY_ISO = () => new Date().toISOString().slice(0, 10)
const CASH = 'cash'
const NONNEG_RE = /^\d+(\.\d+)?$/
const amountOk = (s: string) => NONNEG_RE.test(s.trim())

// The tone → Base-input border utility (mirrors Badge's variant→class map; keyed by the RESOLVED
// tone, so this is a render map, not a status→tone decision — the §4 registry owns that).
const BORDER_FOR_TONE: Record<StatusTone, string> = {
  positive: 'border-success',
  warning: 'border-warning',
  // `border-error` collides with the `--color-border-error` token (design-tokens guard §1.4a) — the
  // sanctioned doubled spelling resolves it. (fxBaseSource never yields critical; kept total for the map.)
  critical: 'border-border-error',
  neutral: 'border-border',
  info: 'border-info',
}

interface FormState {
  name: string
  event_date: string
  transaction_type: 'inflow' | 'outflow'
  category_id: string
  payee_person_id: string
  paid_with: string // CASH sentinel or an account id
  currency: string
  amount: string
  is_shared_expense: boolean
  is_gst_claimable: boolean
  notes: string
  override_base: boolean
  amount_base: string
}

const emptyForm = (currency: string, payee: string): FormState => ({
  name: '',
  event_date: TODAY_ISO(),
  transaction_type: 'outflow',
  category_id: '',
  payee_person_id: payee,
  paid_with: CASH,
  currency,
  amount: '',
  is_shared_expense: true,
  is_gst_claimable: false,
  notes: '',
  override_base: false,
  amount_base: '',
})

const TYPE_OPTIONS = [
  { value: 'outflow', label: 'Outflow' },
  { value: 'inflow', label: 'Inflow' },
]

interface TransactionModalProps {
  open: boolean
  onClose: () => void
  /** Builds + sends the create request (the page wires useEntityManager + toast + close). */
  onSubmit: (payload: TransactionCreate) => Promise<void>
}

export function TransactionModal({ open, onClose, onSubmit }: TransactionModalProps) {
  const currentPersonId = useAuthStore((s) => s.currentPerson?.personId)
  const [form, setForm] = useState<FormState>(() => emptyForm('', ''))

  const currencyQuery = useQuery({
    queryKey: ['currencies'],
    queryFn: async () => (await api.get<EntityListResponse<Currency>>('/api/currencies')).data,
  })
  const currencies = useMemo(() => currencyQuery.data?.items ?? [], [currencyQuery.data])
  const base = currencies.find((c) => c.is_base)
  const baseCurrency = base?.code ?? 'SGD'
  const currencyCodes = useMemo(() => {
    const codes = currencies.filter((c) => c.is_display_active).map((c) => c.code)
    return codes.includes(baseCurrency) ? codes : [baseCurrency, ...codes]
  }, [currencies, baseCurrency])

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

  const accountsQuery = useQuery({
    queryKey: ['accounts', { includeArchived: false }],
    queryFn: async () => (await api.get<EntityListResponse<Account>>('/api/accounts')).data,
  })
  // Only ledger-backed accounts take a transaction leg — capital/asset/insurance are funded via
  // Transfers (Story 6.5), never a transaction (UX Transactions §, D1). Cash is the no-account option.
  const payableAccounts = useMemo(
    () => (accountsQuery.data?.items ?? []).filter((a) => a.account_type === 'bank' || a.account_type === 'credit_card'),
    [accountsQuery.data],
  )

  // Reset the form each open (default currency = base, payer = the current person).
  useEffect(() => {
    if (open) setForm(emptyForm(baseCurrency, currentPersonId ?? ''))
  }, [open, baseCurrency, currentPersonId])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const isOutflow = form.transaction_type === 'outflow'
  const isForeign = form.currency !== '' && form.currency !== baseCurrency

  // Spot base fill (display only; the server recomputes authoritatively on save).
  const rateRow = currencies.find((c) => c.code === form.currency)
  const rate = Number(rateRow?.rate_to_base ?? 0)
  const amountNum = Number(form.amount || 0)
  const baseCalculated = amountNum * rate
  const source = form.override_base ? 'manual' : 'spot'
  const tone = statusTone('fxBaseSource', source)
  const overrideNum = Number(form.amount_base || 0)
  const fxDelta = form.override_base ? baseCalculated - overrideNum : 0

  const saveDisabled =
    form.name.trim() === '' ||
    !amountOk(form.amount) ||
    form.currency === '' ||
    (isForeign && form.override_base && !amountOk(form.amount_base))

  const handleSave = async () => {
    const payload: TransactionCreate = {
      name: form.name.trim(),
      event_date: form.event_date,
      transaction_type: form.transaction_type,
      category_id: form.category_id || null,
      payee_person_id: form.payee_person_id || null,
      // Cash carries no account leg; an account-paid row links via source_account_id (method stays null).
      payment_method: form.paid_with === CASH ? CASH : null,
      source_account_id: form.paid_with === CASH ? null : form.paid_with,
      notes: form.notes.trim() || null,
      // Shared expense is outflow-only (mirrors the DB CHECK); false for inflow.
      is_shared_expense: isOutflow ? form.is_shared_expense : false,
      is_gst_claimable: form.is_gst_claimable,
      currency: form.currency,
      amount: cleanAmount(form.amount.trim()),
      // Only send the override when the user opted to enter an exact base figure on a foreign row.
      amount_base:
        isForeign && form.override_base ? cleanAmount(form.amount_base.trim()) : undefined,
    }
    await onSubmit(payload)
  }

  // Paid-with rows disambiguate accounts by type glyph + institution + owner (D1) — so two "DBS" rows
  // or a bank vs credit-card read differently. `searchText` drives the searchable filter.
  const paidWithOptions = [
    { value: CASH, searchText: 'Cash', label: <span className="inline-flex items-center gap-2xs">Cash</span> },
    ...payableAccounts.map((a) => ({
      value: a.id,
      searchText: `${a.name} ${a.institution ?? ''}`,
      label: (
        <span className="inline-flex items-center gap-2xs">
          <Icon icon={ACCOUNT_TYPE_ICON[a.account_type]} size={16} className="text-text-muted" />
          <span>{a.name}</span>
          {a.institution && <span className="text-text-muted">· {a.institution}</span>}
          {a.owner_ids.slice(0, 3).map((id) => {
            const m = memberById.get(id)
            return (
              <Avatar key={id} src={m?.pictureUrl ?? undefined} name={m?.displayName ?? m?.email ?? id} colour={m?.colour ?? undefined} size={20} />
            )
          })}
        </span>
      ),
    })),
  ]
  // Category options carry the category's identity colour: a leading Dot + the name tinted through the
  // entity-axis floor (`--entity-colour` → text-entity-fg, the CategoryTree path — never raw hex).
  const categoryOptions = categories.map((c) => ({
    value: c.id,
    searchText: c.name,
    label: (
      <span className="inline-flex items-center gap-2xs" style={{ '--entity-colour': c.color } as CSSProperties}>
        <Dot color={c.color} />
        <span className="text-entity-fg">{c.name}</span>
      </span>
    ),
  }))
  const memberOption = (m: Member) => ({
    value: m.personId,
    label: (
      <span className="inline-flex items-center gap-2xs">
        <Avatar src={m.pictureUrl ?? undefined} name={m.displayName ?? m.email} colour={m.colour ?? undefined} size={20} />
        <span>{m.displayName ?? m.email}</span>
      </span>
    ),
  })

  return (
    <EntityModal
      open={open}
      onClose={onClose}
      title="New transaction"
      onSave={handleSave}
      saveDisabled={saveDisabled}
      saveLabel="Add"
    >
      <div className="flex flex-col gap-xs">
        <Label htmlFor="txn-name" required>
          Name
        </Label>
        <Input
          id="txn-name"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="e.g. Groceries"
        />
      </div>

      <div className="flex flex-col gap-xs">
        <Label htmlFor="txn-date" required>
          Date
        </Label>
        <DatePicker id="txn-date" value={form.event_date} onChange={(v) => set('event_date', v)} />
      </div>

      <div className="flex flex-col gap-xs">
        <Label>Type</Label>
        <SegmentedControl
          value={form.transaction_type}
          options={TYPE_OPTIONS}
          onChange={(v) => set('transaction_type', v as 'inflow' | 'outflow')}
        />
      </div>

      <div className="flex flex-col gap-xs">
        <Label htmlFor="txn-category">Category</Label>
        <Dropdown
          id="txn-category"
          value={form.category_id}
          placeholder="Select…"
          options={categoryOptions}
          onChange={(v) => set('category_id', v)}
          searchable
        />
      </div>

      <div className="flex flex-col gap-xs">
        <Label htmlFor="txn-payee">Payer</Label>
        <Dropdown
          id="txn-payee"
          value={form.payee_person_id}
          placeholder="Select…"
          options={members.map(memberOption)}
          onChange={(v) => set('payee_person_id', v)}
        />
      </div>

      <div className="flex flex-col gap-xs">
        {/* The account field's label follows the money direction (D1): out of an account vs into it. */}
        <Label htmlFor="txn-paid-with">{isOutflow ? 'Paid with' : 'Paid to'}</Label>
        <Dropdown
          id="txn-paid-with"
          value={form.paid_with}
          options={paidWithOptions}
          onChange={(v) => set('paid_with', v)}
          searchable
        />
      </div>

      <div className="flex flex-col gap-xs md:col-span-2">
        <Label htmlFor="txn-amount" required>
          Amount
        </Label>
        <MonetaryValueInput
          id="txn-amount"
          amount={form.amount}
          currency={form.currency}
          currencyOptions={currencyCodes}
          onAmountChange={(v) => set('amount', v)}
          onCurrencyChange={(v) => set('currency', v)}
        />
      </div>

      {/* FX money block (UX §12 line 749) — collapses entirely when the entered currency is the base
          currency (no conversion). On a foreign row: the spot base fill (read-only) with an optional
          exact-base override; the source indicator = the Base input's border tone + a tag (§4). */}
      {isForeign && (
        <div className="flex flex-col gap-xs md:col-span-2">
          <Label htmlFor="txn-base">Base ({baseCurrency})</Label>
          {/* One frame: the source-tone border IS the field (§4/§10). The override uses a frameless
              input (the box owns the single border — no competing ring); the spot value + the input
              both carry the themed `text-strong` token so the figure is never unthemed/black. */}
          <div
            className={`flex items-center justify-between gap-sm rounded-md border ${BORDER_FOR_TONE[tone]} bg-surface-raised px-sm h-control`}
          >
            {form.override_base ? (
              <input
                id="txn-base"
                inputMode="decimal"
                className="min-w-0 flex-1 border-0 bg-transparent font-mono text-sm text-text-strong outline-none focus:outline-none"
                value={form.amount_base}
                onChange={(e) => set('amount_base', e.target.value)}
                placeholder="Exact base amount"
              />
            ) : (
              <MonetaryValue
                amount={String(baseCalculated)}
                currency={baseCurrency}
                symbol={symbolForCode(baseCurrency, currencies)}
                variant="columnar"
                className="text-text-strong"
              />
            )}
            <Badge variant={BADGE_VARIANT_FOR_TONE[tone]}>{source}</Badge>
          </div>
          <div className="flex items-center justify-between text-sm text-text-muted">
            <span>{displayRate(rateRow?.rate_to_base ?? '0', baseCurrency, form.currency, false)}</span>
            {form.override_base && (
              <span>
                Δ{' '}
                <MonetaryValue
                  amount={String(fxDelta)}
                  currency={baseCurrency}
                  symbol={symbolForCode(baseCurrency, currencies)}
                  variant="columnar"
                  showSign
                />
              </span>
            )}
          </div>
          <Checkbox
            label="Enter the exact base amount from my statement"
            checked={form.override_base}
            onChange={(v) => set('override_base', v)}
          />
        </div>
      )}

      {/* Behavioural flags — outflow only (shared expense is outflow-only by DB CHECK). */}
      {isOutflow && (
        <div className="flex flex-col gap-xs md:col-span-2">
          <Checkbox
            label="Shared expense"
            checked={form.is_shared_expense}
            onChange={(v) => set('is_shared_expense', v)}
          />
          <Checkbox
            label="GST-claimable"
            checked={form.is_gst_claimable}
            onChange={(v) => set('is_gst_claimable', v)}
          />
        </div>
      )}

      <div className="flex flex-col gap-xs md:col-span-2">
        <Label htmlFor="txn-notes">Notes</Label>
        <Input
          id="txn-notes"
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Optional — merchant, reference…"
        />
      </div>
    </EntityModal>
  )
}
