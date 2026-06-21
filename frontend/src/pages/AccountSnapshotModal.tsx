import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { EntityModal } from '../components/entity'
import { Label } from '../components/primitives/Label'
import { Input } from '../components/primitives/Input'
import { Dropdown } from '../components/primitives/Dropdown'
import { DatePicker } from '../components/primitives/DatePicker'
import { MonetaryValueInput } from '../components/primitives/MonetaryValueInput'
import { api } from '../api/client'
import { formatDateDisplay } from '../lib/date'
import type { Account, AccountSnapshotListOut } from '../types/account'

// Add-value-snapshot modal (UX §8.2a) — co-located with the accounts page (composes existing
// primitives, NOT a /design-system primitive). The three user sources are functionally identical;
// the choice is only a provenance label (ARCH §3.5). Posts an `account_snapshots` row, then
// invalidates the accounts grid (current value recomputes) + this account's snapshot history.

const TODAY_ISO = () => new Date().toISOString().slice(0, 10)

const SOURCE_OPTIONS = [
  { value: 'manual', label: 'Manual' },
  { value: 'reconciliation', label: 'Reconciliation' },
  { value: 'appraisal', label: 'Appraisal' },
]

interface AccountSnapshotModalProps {
  open: boolean
  onClose: () => void
  account: Account | null
  /** Household display-active currency codes (the value picker options). */
  currencyOptions: string[]
  /** Surfaces a failed POST as a page toast (the page owns toasting). */
  onError: (err: unknown) => void
}

export function AccountSnapshotModal({
  open,
  onClose,
  account,
  currencyOptions,
  onError,
}: AccountSnapshotModalProps) {
  const queryClient = useQueryClient()
  const [snapshotDate, setSnapshotDate] = useState(TODAY_ISO())
  const [value, setValue] = useState('')
  const [currency, setCurrency] = useState('')
  const [source, setSource] = useState('manual')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open || !account) return
    setSnapshotDate(TODAY_ISO())
    setValue('')
    setCurrency(account.currency) // default = the account's native currency (§8.2a)
    setSource('manual')
    setNote('')
  }, [open, account])

  // The latest snapshot, for the header reference (§8.2a). Enabled only while open.
  const snapshotsQuery = useQuery({
    queryKey: ['account-snapshots', account?.id],
    queryFn: async () =>
      (await api.get<AccountSnapshotListOut>(`/api/accounts/${account!.id}/snapshots`)).data,
    enabled: open && account !== null,
  })
  const latest = snapshotsQuery.data?.items[0]

  const saveDisabled = !/^-?\d+(\.\d+)?$/.test(value.trim()) || snapshotDate === ''

  const handleSave = async () => {
    if (!account) return
    try {
      await api.post(`/api/accounts/${account.id}/snapshots`, {
        snapshot_date: snapshotDate,
        value,
        currency,
        source,
        note: note.trim() || null,
      })
      await queryClient.invalidateQueries({ queryKey: ['accounts'] })
      await queryClient.invalidateQueries({ queryKey: ['account-snapshots', account.id] })
      onClose()
    } catch (err) {
      onError(err)
    }
  }

  return (
    <EntityModal
      open={open}
      onClose={onClose}
      title="Add value snapshot"
      onSave={handleSave}
      saveDisabled={saveDisabled}
      saveLabel="Save snapshot"
    >
      <div className="flex flex-col gap-2xs md:col-span-2">
        <span className="text-sm text-text-secondary">
          {latest
            ? `Latest: ${latest.currency} ${latest.value} · ${formatDateDisplay(latest.snapshot_date)}`
            : 'No snapshots yet'}
        </span>
      </div>

      <div className="flex flex-col gap-xs">
        <Label htmlFor="snap-date" required>
          Date
        </Label>
        <DatePicker id="snap-date" value={snapshotDate} onChange={setSnapshotDate} />
      </div>

      <div className="flex flex-col gap-xs">
        <Label htmlFor="snap-value" required>
          Value
        </Label>
        <MonetaryValueInput
          id="snap-value"
          amount={value}
          currency={currency}
          currencyOptions={currencyOptions}
          onAmountChange={setValue}
          onCurrencyChange={setCurrency}
        />
      </div>

      <div className="flex flex-col gap-xs">
        <Label htmlFor="snap-source" required>
          Source
        </Label>
        <Dropdown id="snap-source" value={source} options={SOURCE_OPTIONS} onChange={setSource} />
      </div>

      <div className="flex flex-col gap-xs md:col-span-2">
        <Label htmlFor="snap-note">Notes</Label>
        <Input
          id="snap-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional"
        />
      </div>
    </EntityModal>
  )
}
