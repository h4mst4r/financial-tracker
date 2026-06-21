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
// per-subtype fields (interest, limits, coverage…) arrive in Stories 4.7/4.8; the slot is otherwise
// empty here. `account_type` is immutable on edit (the STI discriminator).

const TODAY_ISO = () => new Date().toISOString().slice(0, 10)

const TYPE_OPTIONS = (Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((t) => ({
  value: t,
  label: ACCOUNT_TYPE_LABEL[t],
}))

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
})

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
      })
    } else {
      setForm(emptyForm(currentPersonId ? [currentPersonId] : [], baseCurrency))
    }
  }, [open, editing, currentPersonId, baseCurrency])

  const isLedger = LEDGER_BACKED.has(form.account_type)

  // Opening balance must be a decimal (a credit card's may be negative) — block non-numeric input
  // client-side instead of letting it round-trip to a generic backend 422.
  const saveDisabled =
    form.name.trim() === '' ||
    (isLedger &&
      (!/^-?\d+(\.\d+)?$/.test(form.opening_balance.trim()) || form.opening_balance_date === '')) ||
    !/^#[0-9a-fA-F]{6}$/.test(form.colour)

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
    if (editing) {
      // PATCH — no `account_type` (immutable STI discriminator); owners go via the owner PUT.
      // Currency only when it actually changed (the backend locks it once the account has history).
      const currencyPatch = form.currency !== editing.currency ? { currency: form.currency } : {}
      await onSubmit({ ...shared, ...currencyPatch, ...ledger }, editing.id, form.ownerIds)
    } else {
      await onSubmit(
        { account_type: form.account_type, currency: form.currency, ...shared, ...ledger },
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
