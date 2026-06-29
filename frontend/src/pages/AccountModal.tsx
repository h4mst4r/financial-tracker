import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ACTION_ICON } from '../config/iconRegistry'
import { Icon } from '../components/primitives/Icon'
import { EntityModal } from '../components/entity'
import { Label } from '../components/primitives/Label'
import { Input } from '../components/primitives/Input'
import { Dropdown } from '../components/primitives/Dropdown'
import { Avatar } from '../components/primitives/Avatar'
import { ColourPicker } from '../components/primitives/ColourPicker'
import { DatePicker } from '../components/primitives/DatePicker'
import { MonetaryValueInput } from '../components/primitives/MonetaryValueInput'
import { api } from '../api/client'
import { cleanAmount } from '../lib/currency'
import { useAuthStore } from '../stores/authStore'
import type { ListResponse, Member } from '../types/household'
import { ACCOUNT_TYPE_LABEL, ACCOUNT_DEFAULT_COLOUR } from '../config/accountIcons'
import { LEDGER_BACKED, type Account, type AccountType } from '../types/account'

const ownerLabel = (m: Member) => m.displayName ?? m.email

// Multi-owner chips (UX §8.2, bible §8 taginput) — a constrained member multiselect (NOT the
// Epic-5 free-text TagInput primitive). Selected owners render as avatar + name chips; an "add
// owner…" Dropdown offers the remaining **active** members. The last chip can't be removed (≥1
// owner, AC1). `members` is the **full** household roster (active + archived) so an existing
// archived owner still resolves to a real name/avatar (the add-list below is filtered to active).
function OwnerPicker({
  members,
  value,
  onChange,
}: {
  members: Member[]
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const byId = useMemo(() => new Map(members.map((m) => [m.personId, m])), [members])
  // Resolve chips from the full roster, but only offer ACTIVE members as new owners.
  const remaining = members.filter((m) => m.status === 'active' && !value.includes(m.personId))

  return (
    <div className="taginput flex flex-wrap items-center gap-2xs rounded-md border border-border bg-surface p-2xs">
      {value.map((id) => {
        const m = byId.get(id)
        const name = m ? ownerLabel(m) : id
        return (
          <span
            key={id}
            className="inline-flex items-center gap-2xs rounded-full bg-surface-active py-2xs pl-2xs pr-xs text-sm text-text-strong"
          >
            <Avatar src={m?.pictureUrl ?? undefined} name={name} colour={m?.colour ?? undefined} size={20} />
            <span>{name}</span>
            <button
              type="button"
              aria-label={`Remove ${name}`}
              disabled={value.length === 1}
              onClick={() => onChange(value.filter((v) => v !== id))}
              className="text-text-default enabled:hover:text-text-strong disabled:text-text-faint disabled:cursor-not-allowed"
            >
              <Icon icon={ACTION_ICON.close} size={14} />
            </button>
          </span>
        )
      })}
      {remaining.length > 0 && (
        <div className="w-owner-add">
          <Dropdown
            value=""
            placeholder="add owner…"
            options={remaining.map((m) => ({
              value: m.personId,
              label: (
                <span className="inline-flex items-center gap-2xs">
                  <Avatar src={m.pictureUrl ?? undefined} name={ownerLabel(m)} colour={m.colour ?? undefined} size={20} />
                  <span>{ownerLabel(m)}</span>
                </span>
              ),
            }))}
            onChange={(id) => onChange([...value, id])}
          />
        </div>
      )}
    </div>
  )
}

// The single create/edit surface for accounts (UX §8.2), shared by all four ACCOUNTS routes. The type
// Dropdown swaps the subtype field slot; ledger-backed types (bank/credit_card) require an opening
// balance + date. Accounts use the type-default icon — NO EmojiIconPicker (UX §8.2). The deep
// per-subtype fields are all wired here: bank + credit-card (Story 4.7), capital/asset/insurance
// (Story 4.8). The only remaining seam is the Epic-7 formula-FK columns (depreciation_formula_id /
// interest_formula_id / fx_formula_id) and the deferred insurance coverage-rows read view (Story
// 4.11 detail surface). `account_type` is immutable on edit (the STI discriminator).

const TODAY_ISO = () => new Date().toISOString().slice(0, 10)

// Locked option sets (Story 4.7). `reward_type` is the backend Literal; `interest_frequency` is a
// free-form column with no specced enum — locked to these four so the stored value is deterministic.
const INTEREST_FREQUENCY_OPTIONS = ['monthly', 'quarterly', 'semi-annual', 'annual'].map((v) => ({
  value: v,
  label: v,
}))
const REWARD_TYPE_OPTIONS = ['points', 'cashback', 'miles', 'none'].map((v) => ({ value: v, label: v }))
// Insurance option sets (Story 4.8). `policy_type`/`policy_status` are backend Literals; the
// premium frequency reuses INTEREST_FREQUENCY_OPTIONS (a free-form column, locked like 4.7's
// interest_frequency so the stored value is deterministic).
const POLICY_TYPE_OPTIONS = ['life', 'term', 'health'].map((v) => ({ value: v, label: v }))
const POLICY_STATUS_OPTIONS = ['active', 'cancelled'].map((v) => ({ value: v, label: v }))

interface FormState {
  account_type: AccountType
  name: string
  currency: string
  institution: string
  notes: string
  colour: string
  vivid: boolean
  opening_balance: string
  opening_balance_date: string
  ownerIds: string[]
  // Bank subtype (Story 4.7) — held as strings in form state; coerced/null'd on submit.
  account_number: string
  interest_rate: string
  interest_frequency: string
  reserved_amount: string
  // Credit-card subtype (Story 4.7).
  credit_limit: string
  billing_day: string
  due_day: string
  reward_type: string
  reward_points: string
  reward_rate: string
  annual_fee: string
  bonus_limit: string
  points_expiry: string
  // Capital subtype (Story 4.8).
  investment_type: string
  cost_basis: string
  // Asset subtype (Story 4.8).
  asset_type: string
  registration_no: string
  purchase_date: string
  purchase_value: string
  // Insurance subtype (Story 4.8).
  policy_no: string
  insurer: string
  policy_type: string
  policy_status: string
  premium_frequency: string
  coverage_death: string
  coverage_tpd: string
  coverage_ci: string
  coverage_early_ci: string
  coverage_personal_accident: string
  coverage_hospital: string
  surrender_value: string
  surrender_inquiry_date: string
  // Create-only convenience for asset-like accounts (Story 4.12): an optional opening value that
  // writes the first `manual` snapshot after create (the page does the POST). NOT an account column.
  initial_value: string
}

const emptyForm = (
  ownerIds: string[] = [],
  currency = '',
  accountType: AccountType = 'bank',
): FormState => ({
  account_type: accountType,
  name: '',
  currency,
  institution: '',
  notes: '',
  colour: ACCOUNT_DEFAULT_COLOUR,
  vivid: false,
  // A new credit card almost always opens at no spend → default 0; a bank stays blank (a real balance
  // the user must enter). Story 4.12 AC3.
  opening_balance: accountType === 'credit_card' ? '0' : '',
  opening_balance_date: TODAY_ISO(),
  ownerIds,
  account_number: '',
  interest_rate: '',
  interest_frequency: '',
  reserved_amount: '',
  credit_limit: '',
  billing_day: '',
  due_day: '',
  reward_type: '',
  reward_points: '',
  reward_rate: '',
  annual_fee: '',
  bonus_limit: '',
  points_expiry: '',
  investment_type: '',
  cost_basis: '',
  asset_type: '',
  registration_no: '',
  purchase_date: '',
  purchase_value: '',
  policy_no: '',
  insurer: '',
  policy_type: '',
  policy_status: '',
  premium_frequency: '',
  coverage_death: '',
  coverage_tpd: '',
  coverage_ci: '',
  coverage_early_ci: '',
  coverage_personal_accident: '',
  coverage_hospital: '',
  surrender_value: '',
  surrender_inquiry_date: '',
  initial_value: '',
})

// Subtype field validators (Story 4.7) — all optional, so empty is always valid; only a non-empty
// value is checked, so a malformed entry blocks Save client-side instead of round-tripping to a 422.
const NUM_RE = /^-?\d+(\.\d+)?$/ // signed decimal (interest rate / opening balance may be negative)
const NONNEG_RE = /^\d+(\.\d+)?$/ // unsigned decimal (limits/fees can't be negative)
const INT_RE = /^\d+$/ // plain integer digits only (rejects hex/exponent that Number() would parse)
const numOk = (s: string) => s.trim() === '' || NUM_RE.test(s.trim())
const nonNegOk = (s: string) => s.trim() === '' || NONNEG_RE.test(s.trim())
const dayOk = (s: string) => {
  if (s.trim() === '') return true
  if (!INT_RE.test(s.trim())) return false
  const n = Number(s)
  return n >= 1 && n <= 31
}
const countOk = (s: string) => s.trim() === '' || INT_RE.test(s.trim())

interface AccountModalProps {
  open: boolean
  onClose: () => void
  editing: Account | null
  baseCurrency: string
  /** The route's account subtypes (Story 4.12): on create the Type is pre-selected to `subtypes[0]`
   *  and the Type dropdown is restricted to these; a single-subtype route (`/capital` etc.) locks it. */
  subtypes: AccountType[]
  /** Household display-active currency codes (the modal currency picker options; default = base). */
  currencyOptions: string[]
  /** Builds + sends the create/edit request (the page wires useEntityManager + toast + close).
   *  `ownerIds` is the chosen owner set: folded into the create payload, applied via the owner PUT
   *  on edit (Story 4.3). `initialValue` (create-only, asset-like) is the optional opening value the
   *  page writes as the first snapshot after the account is created (Story 4.12 AC4). */
  onSubmit: (
    payload: Record<string, unknown>,
    id: string | null,
    ownerIds: string[],
    initialValue: string | null,
  ) => Promise<void>
}

export function AccountModal({
  open,
  onClose,
  editing,
  baseCurrency,
  subtypes,
  currencyOptions,
  onSubmit,
}: AccountModalProps) {
  const currentPersonId = useAuthStore((s) => s.currentPerson?.personId)
  const [form, setForm] = useState<FormState>(emptyForm)

  const membersQuery = useQuery({
    queryKey: ['household', 'members'],
    queryFn: async () => (await api.get<ListResponse<Member>>('/api/household/members')).data,
  })
  // Full roster (active + archived) — OwnerPicker resolves chips from this and filters the add-list
  // to active itself, so an account with an archived owner still shows that owner's name/avatar.
  const allMembers = useMemo(() => membersQuery.data?.items ?? [], [membersQuery.data])

  useEffect(() => {
    if (!open) return
    if (editing) {
      const ledger = 'opening_balance' in editing ? editing.opening_balance : null
      const ledgerDate = 'opening_balance_date' in editing ? editing.opening_balance_date : null
      // Repopulate every subtype field from the discriminated-union response (`'x' in editing` narrows
      // the union; nullable columns → '' so the inputs are controlled). Decimals/ints → String().
      const str = (v: string | number | null | undefined) => (v == null ? '' : String(v))
      // Money fields prefill WITHOUT dead trailing zeros ("50000.0000" → "50000"); text/id fields
      // keep verbatim (leading zeros in an account number matter).
      const money = (v: string | number | null | undefined) => (v == null ? '' : cleanAmount(String(v)))
      const bank = editing.account_type === 'bank' ? editing : null
      const cc = editing.account_type === 'credit_card' ? editing : null
      const cap = editing.account_type === 'capital' ? editing : null
      const ast = editing.account_type === 'asset' ? editing : null
      const ins = editing.account_type === 'insurance' ? editing : null
      setForm({
        account_type: editing.account_type,
        name: editing.name,
        currency: editing.currency,
        institution: editing.institution ?? '',
        notes: editing.notes ?? '',
        colour: editing.colour ?? ACCOUNT_DEFAULT_COLOUR,
        vivid: editing.vivid,
        opening_balance: ledger != null ? cleanAmount(ledger) : '',
        opening_balance_date: ledgerDate ?? TODAY_ISO(),
        ownerIds: editing.owner_ids,
        account_number: str(bank?.account_number),
        interest_rate: money(bank?.interest_rate),
        interest_frequency: str(bank?.interest_frequency),
        reserved_amount: money(bank?.reserved_amount),
        credit_limit: money(cc?.credit_limit),
        billing_day: str(cc?.billing_day),
        due_day: str(cc?.due_day),
        reward_type: str(cc?.reward_type),
        reward_points: str(cc?.reward_points),
        reward_rate: money(cc?.reward_rate),
        annual_fee: money(cc?.annual_fee),
        bonus_limit: money(cc?.bonus_limit),
        points_expiry: str(cc?.points_expiry),
        investment_type: str(cap?.investment_type),
        cost_basis: money(cap?.cost_basis),
        asset_type: str(ast?.asset_type),
        registration_no: str(ast?.registration_no),
        purchase_date: str(ast?.purchase_date),
        purchase_value: money(ast?.purchase_value),
        policy_no: str(ins?.policy_no),
        insurer: str(ins?.insurer),
        policy_type: str(ins?.policy_type),
        policy_status: str(ins?.policy_status),
        premium_frequency: str(ins?.premium_frequency),
        coverage_death: money(ins?.coverage_death),
        coverage_tpd: money(ins?.coverage_tpd),
        coverage_ci: money(ins?.coverage_ci),
        coverage_early_ci: money(ins?.coverage_early_ci),
        coverage_personal_accident: money(ins?.coverage_personal_accident),
        coverage_hospital: str(ins?.coverage_hospital),
        surrender_value: money(ins?.surrender_value),
        surrender_inquiry_date: str(ins?.surrender_inquiry_date),
        initial_value: '', // create-only — on edit, value history is the §8.2b mini-ledger (4.11)
      })
    } else {
      setForm(emptyForm(currentPersonId ? [currentPersonId] : [], baseCurrency, subtypes[0]))
    }
  }, [open, editing, currentPersonId, baseCurrency, subtypes])

  const isLedger = LEDGER_BACKED.has(form.account_type)
  // Type is pre-selected by route + restricted to the route's subtypes; a single-subtype route locks
  // it, and editing always locks it (the STI discriminator is immutable). Story 4.12 AC1.
  const typeOptions = useMemo(
    () => subtypes.map((t) => ({ value: t, label: ACCOUNT_TYPE_LABEL[t] })),
    [subtypes],
  )
  const typeLocked = editing !== null || subtypes.length === 1
  // The asset-like initial-value field shows only on a create of capital/asset/insurance (AC4).
  const showInitialValue =
    editing === null && ['capital', 'asset', 'insurance'].includes(form.account_type)

  // Per-field validity of the (optional) subtype inputs — drives both the inline error state and the
  // save gate (Story 4.7). Empty is always valid; a malformed non-empty value blocks Save.
  const fieldOk = {
    interest_rate: numOk(form.interest_rate), // a rate may be negative (real negative rates exist)
    reserved_amount: nonNegOk(form.reserved_amount),
    credit_limit: nonNegOk(form.credit_limit),
    annual_fee: nonNegOk(form.annual_fee),
    bonus_limit: nonNegOk(form.bonus_limit),
    billing_day: dayOk(form.billing_day),
    due_day: dayOk(form.due_day),
    reward_points: countOk(form.reward_points),
    // cashback % — non-negative AND < 100 (the Numeric(6,4) column max is 99.9999); blocks an
    // out-of-range rate client-side instead of round-tripping to a 422 (Story 4.12).
    reward_rate:
      nonNegOk(form.reward_rate) &&
      (form.reward_rate.trim() === '' || Number(form.reward_rate) < 100),
    initial_value: nonNegOk(form.initial_value), // asset-like opening value (Story 4.12)
    // Capital/asset/insurance money fields — all non-negative (Story 4.8).
    cost_basis: nonNegOk(form.cost_basis),
    purchase_value: nonNegOk(form.purchase_value),
    coverage_death: nonNegOk(form.coverage_death),
    coverage_tpd: nonNegOk(form.coverage_tpd),
    coverage_ci: nonNegOk(form.coverage_ci),
    coverage_early_ci: nonNegOk(form.coverage_early_ci),
    coverage_personal_accident: nonNegOk(form.coverage_personal_accident),
    surrender_value: nonNegOk(form.surrender_value),
  }
  const subtypeInvalid =
    (form.account_type === 'bank' && (!fieldOk.interest_rate || !fieldOk.reserved_amount)) ||
    (form.account_type === 'credit_card' &&
      (!fieldOk.credit_limit ||
        !fieldOk.annual_fee ||
        !fieldOk.bonus_limit ||
        !fieldOk.billing_day ||
        !fieldOk.due_day ||
        !fieldOk.reward_points ||
        !fieldOk.reward_rate)) ||
    (form.account_type === 'capital' && !fieldOk.cost_basis) ||
    (form.account_type === 'asset' && !fieldOk.purchase_value) ||
    (form.account_type === 'insurance' &&
      (!fieldOk.coverage_death ||
        !fieldOk.coverage_tpd ||
        !fieldOk.coverage_ci ||
        !fieldOk.coverage_early_ci ||
        !fieldOk.coverage_personal_accident ||
        !fieldOk.surrender_value))

  // Opening balance must be a decimal (a credit card's may be negative) — block non-numeric input
  // client-side instead of letting it round-trip to a generic backend 422.
  const saveDisabled =
    form.name.trim() === '' ||
    (isLedger &&
      (!/^-?\d+(\.\d+)?$/.test(form.opening_balance.trim()) || form.opening_balance_date === '')) ||
    !/^#[0-9a-fA-F]{6}$/.test(form.colour) ||
    subtypeInvalid ||
    (showInitialValue && !fieldOk.initial_value)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const handleSave = async () => {
    const shared = {
      name: form.name.trim(),
      institution: form.institution.trim() || null,
      notes: form.notes.trim() || null,
      colour: form.colour,
      vivid: form.vivid,
    }
    const ledger = isLedger
      ? { opening_balance: form.opening_balance, opening_balance_date: form.opening_balance_date }
      : {}
    // Only the active subtype's columns (the backend rejects cross-subtype PATCH fields — Story 4.1
    // review). Empty optional → null (never '' → 422); Decimals as strings, day/points ints as numbers.
    const dec = (s: string) => (s.trim() === '' ? null : s.trim())
    const int = (s: string) => (s.trim() === '' ? null : Number(s))
    const subtype: Record<string, unknown> =
      form.account_type === 'bank'
        ? {
            account_number: form.account_number.trim() || null,
            interest_rate: dec(form.interest_rate),
            interest_frequency: form.interest_frequency || null,
            reserved_amount: dec(form.reserved_amount),
          }
        : form.account_type === 'credit_card'
          ? {
              credit_limit: dec(form.credit_limit),
              billing_day: int(form.billing_day),
              due_day: int(form.due_day),
              reward_type: form.reward_type || null,
              // The reward amount follows reward_type — send only the active field, null the other
              // (Story 4.12 AC5; mirrors the cross-subtype-null discipline). none/unset → both null.
              reward_points:
                form.reward_type === 'points' || form.reward_type === 'miles'
                  ? int(form.reward_points)
                  : null,
              reward_rate: form.reward_type === 'cashback' ? dec(form.reward_rate) : null,
              annual_fee: dec(form.annual_fee),
              bonus_limit: dec(form.bonus_limit),
              points_expiry: form.points_expiry || null,
            }
          : form.account_type === 'capital'
            ? {
                investment_type: form.investment_type.trim() || null,
                cost_basis: dec(form.cost_basis),
              }
            : form.account_type === 'asset'
              ? {
                  asset_type: form.asset_type.trim() || null,
                  registration_no: form.registration_no.trim() || null,
                  purchase_date: form.purchase_date || null,
                  purchase_value: dec(form.purchase_value),
                }
              : form.account_type === 'insurance'
                ? {
                    policy_no: form.policy_no.trim() || null,
                    insurer: form.insurer.trim() || null,
                    policy_type: form.policy_type || null,
                    policy_status: form.policy_status || null,
                    premium_frequency: form.premium_frequency || null,
                    coverage_death: dec(form.coverage_death),
                    coverage_tpd: dec(form.coverage_tpd),
                    coverage_ci: dec(form.coverage_ci),
                    coverage_early_ci: dec(form.coverage_early_ci),
                    coverage_personal_accident: dec(form.coverage_personal_accident),
                    coverage_hospital: form.coverage_hospital.trim() || null,
                    surrender_value: dec(form.surrender_value),
                    surrender_inquiry_date: form.surrender_inquiry_date || null,
                  }
                : {}
    if (editing) {
      // PATCH — no `account_type` (immutable STI discriminator); owners go via the owner PUT.
      // Currency only when it actually changed (the backend locks it once the account has history).
      const currencyPatch = form.currency !== editing.currency ? { currency: form.currency } : {}
      await onSubmit(
        { ...shared, ...currencyPatch, ...ledger, ...subtype },
        editing.id,
        form.ownerIds,
        null,
      )
    } else {
      await onSubmit(
        { account_type: form.account_type, currency: form.currency, ...shared, ...ledger, ...subtype },
        null,
        form.ownerIds,
        showInitialValue ? form.initial_value.trim() || null : null,
      )
    }
  }

  // Native currency locks once the account has activity (== no longer hard-deletable, Story 4.4).
  const currencyLocked = editing !== null && !editing.can_delete

  return (
    <EntityModal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit account' : 'New account'}
      onSave={handleSave}
      saveDisabled={saveDisabled}
      saveLabel={editing ? 'Save' : 'Add'}
    >
      <div className="flex flex-col gap-xs">
        <Label htmlFor="acct-type" required>
          Type
        </Label>
        <Dropdown
          id="acct-type"
          value={form.account_type}
          options={typeOptions}
          onChange={(v) => {
            const t = v as AccountType
            // Switching to a credit card on create applies the AC3 opening-balance default (0) when
            // the field is still empty; other switches leave it untouched.
            setForm((f) => ({
              ...f,
              account_type: t,
              opening_balance:
                t === 'credit_card' && f.opening_balance.trim() === '' ? '0' : f.opening_balance,
            }))
          }}
          // Locked on single-subtype routes + on edit (the STI discriminator is immutable). AC1.
          disabled={typeLocked}
        />
      </div>

      <div className="flex flex-col gap-xs">
        <Label htmlFor="acct-name" required>
          Name
        </Label>
        <Input
          id="acct-name"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="e.g. DBS Multiplier"
        />
      </div>

      <div className="flex flex-col gap-xs">
        <Label htmlFor="acct-currency" required>
          Currency
        </Label>
        <Dropdown
          id="acct-currency"
          value={form.currency}
          options={currencyOptions.map((code) => ({ value: code, label: code }))}
          onChange={(v) => set('currency', v)}
          disabled={currencyLocked}
        />
        {currencyLocked && (
          <span className="text-sm text-text-default">
            Currency locks once the account has activity.
          </span>
        )}
      </div>

      <div className="flex flex-col gap-xs md:col-span-2">
        <Label htmlFor="acct-institution">Institution</Label>
        <Input
          id="acct-institution"
          value={form.institution}
          onChange={(e) => set('institution', e.target.value)}
          placeholder="e.g. DBS Bank"
        />
      </div>

      {isLedger && (
        <>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-opening" required>
              Opening balance
            </Label>
            <MonetaryValueInput
              id="acct-opening"
              amount={form.opening_balance}
              // Opening balance is denominated in the account's native currency (Story 4.4) — the
              // selector is read-only here (the dedicated Currency picker above owns the choice).
              currency={form.currency}
              currencyOptions={[form.currency]}
              onAmountChange={(v) => set('opening_balance', v)}
              onCurrencyChange={() => {}}
            />
          </div>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-opening-date" required>
              Opening date
            </Label>
            <DatePicker
              id="acct-opening-date"
              value={form.opening_balance_date}
              onChange={(v) => set('opening_balance_date', v)}
            />
          </div>
        </>
      )}

      {/* Bank subtype fields (Story 4.7, ARCH §3.5) — all optional. */}
      {form.account_type === 'bank' && (
        <>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-account-number">Account number</Label>
            <Input
              id="acct-account-number"
              value={form.account_number}
              onChange={(e) => set('account_number', e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-interest-rate">Interest rate (%)</Label>
            <Input
              id="acct-interest-rate"
              inputMode="decimal"
              value={form.interest_rate}
              error={!fieldOk.interest_rate}
              onChange={(e) => set('interest_rate', e.target.value)}
              placeholder="e.g. 2.5"
            />
          </div>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-interest-frequency">Interest frequency</Label>
            <Dropdown
              id="acct-interest-frequency"
              value={form.interest_frequency}
              placeholder="Select…"
              options={INTEREST_FREQUENCY_OPTIONS}
              onChange={(v) => set('interest_frequency', v)}
            />
          </div>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-reserved">Reserved amount ({form.currency})</Label>
            <Input
              id="acct-reserved"
              inputMode="decimal"
              value={form.reserved_amount}
              error={!fieldOk.reserved_amount}
              onChange={(e) => set('reserved_amount', e.target.value)}
              placeholder="Optional"
            />
          </div>
        </>
      )}

      {/* Credit-card subtype fields (Story 4.7, ARCH §3.5) — all optional. */}
      {form.account_type === 'credit_card' && (
        <>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-credit-limit">Credit limit ({form.currency})</Label>
            <Input
              id="acct-credit-limit"
              inputMode="decimal"
              value={form.credit_limit}
              error={!fieldOk.credit_limit}
              onChange={(e) => set('credit_limit', e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-annual-fee">Annual fee ({form.currency})</Label>
            <Input
              id="acct-annual-fee"
              inputMode="decimal"
              value={form.annual_fee}
              error={!fieldOk.annual_fee}
              onChange={(e) => set('annual_fee', e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-billing-day">Billing day (1–31)</Label>
            <Input
              id="acct-billing-day"
              inputMode="numeric"
              value={form.billing_day}
              error={!fieldOk.billing_day}
              onChange={(e) => set('billing_day', e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-due-day">Due day (1–31)</Label>
            <Input
              id="acct-due-day"
              inputMode="numeric"
              value={form.due_day}
              error={!fieldOk.due_day}
              onChange={(e) => set('due_day', e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-reward-type">Reward type</Label>
            <Dropdown
              id="acct-reward-type"
              value={form.reward_type}
              placeholder="Select…"
              options={REWARD_TYPE_OPTIONS}
              onChange={(v) => set('reward_type', v)}
            />
          </div>
          {/* Reward amount adapts to reward_type (Story 4.12 AC5): points/miles → a count; cashback
              → a %; none/unset → no field. */}
          {(form.reward_type === 'points' || form.reward_type === 'miles') && (
            <div className="flex flex-col gap-xs">
              <Label htmlFor="acct-reward-points">Reward points / miles</Label>
              <Input
                id="acct-reward-points"
                inputMode="numeric"
                value={form.reward_points}
                error={!fieldOk.reward_points}
                onChange={(e) => set('reward_points', e.target.value)}
                placeholder="Optional"
              />
            </div>
          )}
          {form.reward_type === 'cashback' && (
            <div className="flex flex-col gap-xs">
              <Label htmlFor="acct-reward-rate">Cashback rate (%)</Label>
              <Input
                id="acct-reward-rate"
                inputMode="decimal"
                value={form.reward_rate}
                error={!fieldOk.reward_rate}
                onChange={(e) => set('reward_rate', e.target.value)}
                placeholder="e.g. 1.5"
              />
            </div>
          )}
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-bonus-limit">Bonus limit ({form.currency})</Label>
            <Input
              id="acct-bonus-limit"
              inputMode="decimal"
              value={form.bonus_limit}
              error={!fieldOk.bonus_limit}
              onChange={(e) => set('bonus_limit', e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-points-expiry">Points expiry</Label>
            <DatePicker
              id="acct-points-expiry"
              value={form.points_expiry}
              onChange={(v) => set('points_expiry', v)}
            />
          </div>
        </>
      )}

      {/* Capital subtype fields (Story 4.8, ARCH §3.5) — all optional. */}
      {form.account_type === 'capital' && (
        <>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-investment-type">Investment type</Label>
            <Input
              id="acct-investment-type"
              value={form.investment_type}
              onChange={(e) => set('investment_type', e.target.value)}
              placeholder="e.g. ETF, stock, fund"
            />
          </div>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-cost-basis">Cost basis ({form.currency})</Label>
            <Input
              id="acct-cost-basis"
              inputMode="decimal"
              value={form.cost_basis}
              error={!fieldOk.cost_basis}
              onChange={(e) => set('cost_basis', e.target.value)}
              placeholder="Optional"
            />
          </div>
        </>
      )}

      {/* Asset subtype fields (Story 4.8, ARCH §3.5) — all optional. */}
      {form.account_type === 'asset' && (
        <>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-asset-type">Asset type</Label>
            <Input
              id="acct-asset-type"
              value={form.asset_type}
              onChange={(e) => set('asset_type', e.target.value)}
              placeholder="e.g. property, vehicle"
            />
          </div>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-registration-no">Registration no.</Label>
            <Input
              id="acct-registration-no"
              value={form.registration_no}
              onChange={(e) => set('registration_no', e.target.value)}
              placeholder="strata-title / plate no."
            />
          </div>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-purchase-date">Purchase date</Label>
            <DatePicker
              id="acct-purchase-date"
              value={form.purchase_date}
              onChange={(v) => set('purchase_date', v)}
            />
          </div>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-purchase-value">Purchase value ({form.currency})</Label>
            <Input
              id="acct-purchase-value"
              inputMode="decimal"
              value={form.purchase_value}
              error={!fieldOk.purchase_value}
              onChange={(e) => set('purchase_value', e.target.value)}
              placeholder="Optional"
            />
          </div>
        </>
      )}

      {/* Insurance subtype fields (Story 4.8, ARCH §3.5) — all optional. */}
      {form.account_type === 'insurance' && (
        <>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-policy-no">Policy no.</Label>
            <Input
              id="acct-policy-no"
              value={form.policy_no}
              onChange={(e) => set('policy_no', e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-insurer">Insurer</Label>
            <Input
              id="acct-insurer"
              value={form.insurer}
              onChange={(e) => set('insurer', e.target.value)}
              placeholder="e.g. Prudential"
            />
          </div>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-policy-type">Policy type</Label>
            <Dropdown
              id="acct-policy-type"
              value={form.policy_type}
              placeholder="Select…"
              options={POLICY_TYPE_OPTIONS}
              onChange={(v) => set('policy_type', v)}
            />
          </div>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-policy-status">Policy status</Label>
            <Dropdown
              id="acct-policy-status"
              value={form.policy_status}
              placeholder="Select…"
              options={POLICY_STATUS_OPTIONS}
              onChange={(v) => set('policy_status', v)}
            />
          </div>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-premium-frequency">Premium frequency</Label>
            <Dropdown
              id="acct-premium-frequency"
              value={form.premium_frequency}
              placeholder="Select…"
              options={INTEREST_FREQUENCY_OPTIONS}
              onChange={(v) => set('premium_frequency', v)}
            />
          </div>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-coverage-death">Death cover ({form.currency})</Label>
            <Input
              id="acct-coverage-death"
              inputMode="decimal"
              value={form.coverage_death}
              error={!fieldOk.coverage_death}
              onChange={(e) => set('coverage_death', e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-coverage-tpd">TPD cover ({form.currency})</Label>
            <Input
              id="acct-coverage-tpd"
              inputMode="decimal"
              value={form.coverage_tpd}
              error={!fieldOk.coverage_tpd}
              onChange={(e) => set('coverage_tpd', e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-coverage-ci">Critical illness cover ({form.currency})</Label>
            <Input
              id="acct-coverage-ci"
              inputMode="decimal"
              value={form.coverage_ci}
              error={!fieldOk.coverage_ci}
              onChange={(e) => set('coverage_ci', e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-coverage-early-ci">Early CI cover ({form.currency})</Label>
            <Input
              id="acct-coverage-early-ci"
              inputMode="decimal"
              value={form.coverage_early_ci}
              error={!fieldOk.coverage_early_ci}
              onChange={(e) => set('coverage_early_ci', e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-coverage-pa">Personal accident cover ({form.currency})</Label>
            <Input
              id="acct-coverage-pa"
              inputMode="decimal"
              value={form.coverage_personal_accident}
              error={!fieldOk.coverage_personal_accident}
              onChange={(e) => set('coverage_personal_accident', e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-coverage-hospital">Hospital cover</Label>
            <Input
              id="acct-coverage-hospital"
              value={form.coverage_hospital}
              onChange={(e) => set('coverage_hospital', e.target.value)}
              placeholder="e.g. Private / $2,000 excess"
            />
          </div>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-surrender-value">Surrender value ({form.currency})</Label>
            <Input
              id="acct-surrender-value"
              inputMode="decimal"
              value={form.surrender_value}
              error={!fieldOk.surrender_value}
              onChange={(e) => set('surrender_value', e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-surrender-inquiry-date">Surrender inquiry date</Label>
            <DatePicker
              id="acct-surrender-inquiry-date"
              value={form.surrender_inquiry_date}
              onChange={(v) => set('surrender_inquiry_date', v)}
            />
          </div>
        </>
      )}

      {/* Current value (Story 4.12 AC4) — create-only, asset-like. Optional; on save the page writes
          it as the first `manual` snapshot so the card hero shows a value immediately. */}
      {showInitialValue && (
        <div className="flex flex-col gap-xs md:col-span-2">
          <Label htmlFor="acct-initial-value">Current value ({form.currency})</Label>
          <Input
            id="acct-initial-value"
            inputMode="decimal"
            value={form.initial_value}
            error={!fieldOk.initial_value}
            onChange={(e) => set('initial_value', e.target.value)}
            placeholder="Optional — sets the starting value"
          />
        </div>
      )}

      <div className="flex flex-col gap-xs md:col-span-2">
        <Label htmlFor="acct-colour">Colour</Label>
        <ColourPicker
          id="acct-colour"
          value={form.colour}
          onChange={(colour) => set('colour', colour)}
          vivid={form.vivid}
          onVividChange={(vivid) => set('vivid', vivid)}
        />
      </div>

      <div className="flex flex-col gap-xs md:col-span-2">
        <Label>Owners</Label>
        <OwnerPicker
          members={allMembers}
          value={form.ownerIds}
          onChange={(ids) => set('ownerIds', ids)}
        />
      </div>

      <div className="flex flex-col gap-xs md:col-span-2">
        <Label htmlFor="acct-notes">Notes</Label>
        <Input
          id="acct-notes"
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Optional"
        />
      </div>
    </EntityModal>
  )
}
