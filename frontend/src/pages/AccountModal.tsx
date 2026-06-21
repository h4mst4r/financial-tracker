import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { EntityModal } from '../components/entity'
import { Label } from '../components/primitives/Label'
import { Input } from '../components/primitives/Input'
import { Dropdown } from '../components/primitives/Dropdown'
import { Avatar } from '../components/primitives/Avatar'
import { ColourPicker } from '../components/primitives/ColourPicker'
import { DatePicker } from '../components/primitives/DatePicker'
import { MonetaryValueInput } from '../components/primitives/MonetaryValueInput'
import { api } from '../api/client'
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
            className="inline-flex items-center gap-2xs rounded-full bg-surface-active py-2xs pl-2xs pr-xs text-sm text-text-primary"
          >
            <Avatar src={m?.pictureUrl ?? undefined} name={name} colour={m?.colour ?? undefined} size={20} />
            <span>{name}</span>
            <button
              type="button"
              aria-label={`Remove ${name}`}
              disabled={value.length === 1}
              onClick={() => onChange(value.filter((v) => v !== id))}
              className="text-text-secondary hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <X size={14} />
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
// per-subtype fields: bank + credit-card columns are wired here (Story 4.7); capital/asset/insurance
// remain the Story 4.8 seam. `account_type` is immutable on edit (the STI discriminator).

const TODAY_ISO = () => new Date().toISOString().slice(0, 10)

const TYPE_OPTIONS = (Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((t) => ({
  value: t,
  label: ACCOUNT_TYPE_LABEL[t],
}))

// Locked option sets (Story 4.7). `reward_type` is the backend Literal; `interest_frequency` is a
// free-form column with no specced enum — locked to these four so the stored value is deterministic.
const INTEREST_FREQUENCY_OPTIONS = ['monthly', 'quarterly', 'semi-annual', 'annual'].map((v) => ({
  value: v,
  label: v,
}))
const REWARD_TYPE_OPTIONS = ['points', 'cashback', 'miles', 'none'].map((v) => ({ value: v, label: v }))

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
  annual_fee: string
  bonus_limit: string
  points_expiry: string
}

const emptyForm = (ownerIds: string[] = [], currency = ''): FormState => ({
  account_type: 'bank',
  name: '',
  currency,
  institution: '',
  notes: '',
  colour: ACCOUNT_DEFAULT_COLOUR,
  vivid: false,
  opening_balance: '',
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
  annual_fee: '',
  bonus_limit: '',
  points_expiry: '',
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
  /** Household display-active currency codes (the modal currency picker options; default = base). */
  currencyOptions: string[]
  /** Builds + sends the create/edit request (the page wires useEntityManager + toast + close).
   *  `ownerIds` is the chosen owner set: folded into the create payload, applied via the owner PUT
   *  on edit (Story 4.3). */
  onSubmit: (payload: Record<string, unknown>, id: string | null, ownerIds: string[]) => Promise<void>
}

export function AccountModal({
  open,
  onClose,
  editing,
  baseCurrency,
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
      const bank = editing.account_type === 'bank' ? editing : null
      const cc = editing.account_type === 'credit_card' ? editing : null
      setForm({
        account_type: editing.account_type,
        name: editing.name,
        currency: editing.currency,
        institution: editing.institution ?? '',
        notes: editing.notes ?? '',
        colour: editing.colour ?? ACCOUNT_DEFAULT_COLOUR,
        vivid: editing.vivid,
        opening_balance: ledger ?? '',
        opening_balance_date: ledgerDate ?? TODAY_ISO(),
        ownerIds: editing.owner_ids,
        account_number: str(bank?.account_number),
        interest_rate: str(bank?.interest_rate),
        interest_frequency: str(bank?.interest_frequency),
        reserved_amount: str(bank?.reserved_amount),
        credit_limit: str(cc?.credit_limit),
        billing_day: str(cc?.billing_day),
        due_day: str(cc?.due_day),
        reward_type: str(cc?.reward_type),
        reward_points: str(cc?.reward_points),
        annual_fee: str(cc?.annual_fee),
        bonus_limit: str(cc?.bonus_limit),
        points_expiry: str(cc?.points_expiry),
      })
    } else {
      setForm(emptyForm(currentPersonId ? [currentPersonId] : [], baseCurrency))
    }
  }, [open, editing, currentPersonId, baseCurrency])

  const isLedger = LEDGER_BACKED.has(form.account_type)

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
  }
  const subtypeInvalid =
    (form.account_type === 'bank' && (!fieldOk.interest_rate || !fieldOk.reserved_amount)) ||
    (form.account_type === 'credit_card' &&
      (!fieldOk.credit_limit ||
        !fieldOk.annual_fee ||
        !fieldOk.bonus_limit ||
        !fieldOk.billing_day ||
        !fieldOk.due_day ||
        !fieldOk.reward_points))

  // Opening balance must be a decimal (a credit card's may be negative) — block non-numeric input
  // client-side instead of letting it round-trip to a generic backend 422.
  const saveDisabled =
    form.name.trim() === '' ||
    (isLedger &&
      (!/^-?\d+(\.\d+)?$/.test(form.opening_balance.trim()) || form.opening_balance_date === '')) ||
    !/^#[0-9a-fA-F]{6}$/.test(form.colour) ||
    subtypeInvalid

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
              reward_points: int(form.reward_points),
              annual_fee: dec(form.annual_fee),
              bonus_limit: dec(form.bonus_limit),
              points_expiry: form.points_expiry || null,
            }
          : {}
    if (editing) {
      // PATCH — no `account_type` (immutable STI discriminator); owners go via the owner PUT.
      // Currency only when it actually changed (the backend locks it once the account has history).
      const currencyPatch = form.currency !== editing.currency ? { currency: form.currency } : {}
      await onSubmit({ ...shared, ...currencyPatch, ...ledger, ...subtype }, editing.id, form.ownerIds)
    } else {
      await onSubmit(
        { account_type: form.account_type, currency: form.currency, ...shared, ...ledger, ...subtype },
        null,
        form.ownerIds,
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
          options={TYPE_OPTIONS}
          onChange={(v) => set('account_type', v as AccountType)}
          // The STI discriminator is immutable after create.
          disabled={editing !== null}
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
          <span className="text-sm text-text-secondary">
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
          <div className="flex flex-col gap-xs">
            <Label htmlFor="acct-reward-points">Reward points</Label>
            <Input
              id="acct-reward-points"
              inputMode="numeric"
              value={form.reward_points}
              error={!fieldOk.reward_points}
              onChange={(e) => set('reward_points', e.target.value)}
              placeholder="Optional"
            />
          </div>
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
