import { useEffect, useState } from 'react'
import { EntityModal } from '../components/entity'
import { Label } from '../components/primitives/Label'
import { Input } from '../components/primitives/Input'
import { Dropdown } from '../components/primitives/Dropdown'
import { ColourPicker } from '../components/primitives/ColourPicker'
import { DatePicker } from '../components/primitives/DatePicker'
import { MonetaryValueInput } from '../components/primitives/MonetaryValueInput'
import { ACCOUNT_TYPE_LABEL, ACCOUNT_DEFAULT_COLOUR } from '../config/accountIcons'
import { LEDGER_BACKED, type Account, type AccountType } from '../types/account'

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
  institution: string
  notes: string
  colour: string
  vivid: boolean
  opening_balance: string
  opening_balance_date: string
}

const emptyForm = (): FormState => ({
  account_type: 'bank',
  name: '',
  institution: '',
  notes: '',
  colour: ACCOUNT_DEFAULT_COLOUR,
  vivid: false,
  opening_balance: '',
  opening_balance_date: TODAY_ISO(),
})

interface AccountModalProps {
  open: boolean
  onClose: () => void
  editing: Account | null
  baseCurrency: string
  /** Builds + sends the create/edit request (the page wires useEntityManager + toast + close). */
  onSubmit: (payload: Record<string, unknown>, id: string | null) => Promise<void>
}

export function AccountModal({ open, onClose, editing, baseCurrency, onSubmit }: AccountModalProps) {
  const [form, setForm] = useState<FormState>(emptyForm)

  useEffect(() => {
    if (!open) return
    if (editing) {
      const ledger = 'opening_balance' in editing ? editing.opening_balance : null
      const ledgerDate = 'opening_balance_date' in editing ? editing.opening_balance_date : null
      setForm({
        account_type: editing.account_type,
        name: editing.name,
        institution: editing.institution ?? '',
        notes: editing.notes ?? '',
        colour: editing.colour ?? ACCOUNT_DEFAULT_COLOUR,
        vivid: editing.vivid,
        opening_balance: ledger ?? '',
        opening_balance_date: ledgerDate ?? TODAY_ISO(),
      })
    } else {
      setForm(emptyForm())
    }
  }, [open, editing])

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
      // PATCH — no `account_type` (immutable STI discriminator).
      await onSubmit({ ...shared, ...ledger }, editing.id)
    } else {
      await onSubmit({ account_type: form.account_type, ...shared, ...ledger }, null)
    }
  }

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
              currency={baseCurrency}
              // Opening balance is in the base currency for now; per-account currency + FX is Story 4.4.
              currencyOptions={[baseCurrency]}
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
