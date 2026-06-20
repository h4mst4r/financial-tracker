import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleDollarSign, Pencil, Trash2, MoreVertical } from 'lucide-react'
import { EntityPage, EntityModal } from '../components/entity'
import { Label } from '../components/primitives/Label'
import { Input } from '../components/primitives/Input'
import { Toggle } from '../components/primitives/Toggle'
import { Badge } from '../components/primitives/Badge'
import { ContextMenu } from '../components/primitives/ContextMenu'
import type { ContextMenuEntry } from '../components/primitives'
import { ColourPicker } from '../components/primitives/ColourPicker'
import { ConfirmationDialog } from '../components/primitives/ConfirmationDialog'
import { useAlertStore } from '../stores/alertStore'
import { api, ApiError } from '../api/client'
import type { EntityListResponse } from '../types/entity'
import type { Currency } from '../types/currency'
import {
  isoCurrencyCodes,
  currencyName,
  currencySymbol,
  colourForCode,
  displayRate,
  isStale,
} from '../lib/currency'

// Currencies page (UX §10). EntityPage scaffold over a bespoke FX table (there's no Table primitive
// until Epic 5; the bible's `ledger` CSS is bible-only). Currencies are flat config rows — no
// archive/status — so this uses a plain useQuery + api mutations, NOT useEntityManager. FX fetch
// (Story 3.7), fee editing + the FX-history mini-chart (Story 3.8), and the topbar display-currency
// switcher (Story 9.7) are deliberately out of scope.

const CODE_RE = /^[A-Z]{3}$/
const CODE_DATALIST_ID = 'iso-currency-codes'

interface FormState {
  id: string | null
  code: string
  name: string
  symbol: string
  colour: string
  vivid: boolean
  isDisplayActive: boolean
}

const EMPTY_FORM: FormState = {
  id: null,
  code: '',
  name: '',
  symbol: '',
  colour: colourForCode(''),
  vivid: false,
  isDisplayActive: true,
}

export function Currencies() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [confirmDelete, setConfirmDelete] = useState<Currency | null>(null)
  const pushToast = useAlertStore((s) => s.pushToast)

  const query = useQuery({
    queryKey: ['currencies'],
    queryFn: async () => (await api.get<EntityListResponse<Currency>>('/api/currencies')).data,
  })
  const currencies = query.data?.items ?? []
  const baseCode = currencies.find((c) => c.is_base)?.code ?? 'SGD'
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['currencies'] })

  // RFC 7807 `detail` is a string for our typed errors; 401 short-circuits upstream.
  const toastError = (err: unknown, fallback: string) => {
    const detail = err instanceof ApiError ? err.details?.detail : undefined
    const message =
      typeof detail === 'string' ? detail : err instanceof ApiError ? err.message : fallback
    pushToast({ variant: 'error', message })
  }
  const runAction = async (fn: () => Promise<unknown>, fallback: string, success?: string) => {
    try {
      await fn()
      if (success) pushToast({ variant: 'success', message: success })
    } catch (err) {
      toastError(err, fallback)
    }
  }

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }
  const openEdit = (c: Currency) => {
    setForm({
      id: c.id,
      code: c.code,
      name: c.name,
      symbol: c.symbol,
      colour: c.colour ?? colourForCode(c.code),
      vivid: c.vivid,
      isDisplayActive: c.is_display_active,
    })
    setModalOpen(true)
  }

  // Picking an ISO code auto-fills name + symbol + the deterministic default colour (all overridable).
  const onCodeChange = (raw: string) => {
    const code = raw.toUpperCase()
    setForm((f) => {
      const next = { ...f, code }
      if (CODE_RE.test(code)) {
        if (f.name.trim() === '') next.name = currencyName(code)
        if (f.symbol.trim() === '') next.symbol = currencySymbol(code)
        next.colour = colourForCode(code)
      }
      return next
    })
  }

  const handleSave = async () => {
    const code = form.code.trim().toUpperCase()
    const payload = {
      name: form.name.trim(),
      symbol: form.symbol.trim(),
      colour: form.colour,
      vivid: form.vivid,
      is_display_active: form.isDisplayActive,
    }
    try {
      if (form.id) {
        await api.patch(`/api/currencies/${form.id}`, payload)
      } else {
        await api.post('/api/currencies', { code, ...payload })
      }
      invalidate()
      setModalOpen(false)
    } catch (err) {
      // 409 (duplicate code) / 400 (bad code) surface here, keeping the modal open.
      toastError(err, 'Could not save the currency.')
    }
  }

  const onToggleDisplay = (c: Currency) =>
    runAction(async () => {
      await api.patch(`/api/currencies/${c.id}`, { is_display_active: !c.is_display_active })
      invalidate()
    }, 'Could not update the currency.')

  const doDelete = (c: Currency) =>
    runAction(
      async () => {
        await api.delete(`/api/currencies/${c.id}`)
        invalidate()
      },
      'Could not delete the currency.',
      'Currency deleted',
    )

  const q = search.trim().toLowerCase()
  const visible = currencies.filter(
    (c) => q === '' || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
  )

  const saveDisabled =
    !CODE_RE.test(form.code.trim().toUpperCase()) ||
    form.name.trim() === '' ||
    form.symbol.trim() === '' ||
    !/^#[0-9a-fA-F]{6}$/.test(form.colour)

  const rowMenu = (c: Currency): ContextMenuEntry[] => {
    const items: ContextMenuEntry[] = [{ label: 'Edit', icon: Pencil, onClick: () => openEdit(c) }]
    // The base currency is fixed and non-removable (AC2) — no Delete entry.
    if (!c.is_base) {
      items.push({ divider: true })
      items.push({
        label: 'Delete',
        icon: Trash2,
        destructive: true,
        onClick: () => setConfirmDelete(c),
      })
    }
    return items
  }

  return (
    <div className="p-lg">
      <EntityPage
        title="Currencies"
        info={`${currencies.length} ${currencies.length === 1 ? 'currency' : 'currencies'}`}
        newLabel="currency"
        onNew={openCreate}
        search={search}
        onSearchChange={setSearch}
        view="list"
        onViewChange={() => {}}
        hideViewToggle
        hideSort
        hideArchived
        showArchived={false}
        onShowArchivedChange={() => {}}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        isEmpty={currencies.length === 0}
        emptyIcon={CircleDollarSign}
        emptyTitle="No currencies yet"
        emptyDescription="Add a currency to transact and view in it."
      >
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm" data-testid="currencies-table">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
                <th className="px-md py-sm font-medium">Code</th>
                <th className="px-md py-sm font-medium">Name</th>
                <th className="px-md py-sm font-medium">Rate</th>
                <th className="px-md py-sm font-medium">Fresh</th>
                <th className="px-md py-sm font-medium">Fee</th>
                <th className="px-md py-sm font-medium">Display</th>
                <th className="px-md py-sm font-medium">History</th>
                <th className="px-md py-sm" />
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => {
                const stale = !c.is_base && isStale(c.last_rate_at)
                return (
                  <tr
                    key={c.id}
                    data-testid={`currency-row-${c.code}`}
                    className="border-b border-border last:border-0 hover:bg-surface-hover"
                  >
                    {/* Code in its own colour — text colour, not a dot (§0.1 anti-rainbow). The
                        currency's own colour is entity-identity DATA, applied via inline style. */}
                    <td
                      className="px-md py-sm font-mono font-semibold"
                      style={{ color: c.colour ?? colourForCode(c.code) }}
                    >
                      {c.code}
                    </td>
                    <td className="px-md py-sm text-text-primary">{c.name}</td>
                    <td className="px-md py-sm font-mono text-text-secondary">
                      {displayRate(c.rate_to_base, baseCode, c.code, c.is_base)}
                    </td>
                    <td className="px-md py-sm">
                      {c.is_base ? (
                        <Badge variant="success">fixed</Badge>
                      ) : (
                        <Badge variant={stale ? 'warning' : 'success'}>
                          {c.last_rate_at === null ? 'never' : stale ? 'stale' : 'fresh'}
                        </Badge>
                      )}
                    </td>
                    {/* Fee is read-only here — editing is Story 3.8 (FR-CU-007). */}
                    <td className="px-md py-sm font-mono text-text-secondary">
                      {c.is_base ? '—' : `${(Number(c.fee_pct) * 100).toFixed(1)}%`}
                    </td>
                    <td className="px-md py-sm">
                      {c.is_base ? (
                        <span className="text-xs text-text-muted">always</span>
                      ) : (
                        <Toggle
                          checked={c.is_display_active}
                          onChange={() => onToggleDisplay(c)}
                          aria-label={`Display ${c.code}`}
                        />
                      )}
                    </td>
                    {/* History (FX-rate mini-chart) is Story 3.8 — empty for now. */}
                    <td className="px-md py-sm text-text-muted">—</td>
                    <td className="px-md py-sm text-right">
                      <ContextMenu
                        trigger={
                          <MoreVertical
                            size={16}
                            className="text-text-muted opacity-60 hover:opacity-100"
                          />
                        }
                        items={rowMenu(c)}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </EntityPage>

      {/* Native ISO-4217 typeahead source — no combobox lib (ponytail). */}
      <datalist id={CODE_DATALIST_ID}>
        {isoCurrencyCodes().map((code) => (
          <option key={code} value={code} />
        ))}
      </datalist>

      <EntityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.id ? 'Edit currency' : 'New currency'}
        onSave={handleSave}
        saveDisabled={saveDisabled}
        saveLabel={form.id ? 'Save' : 'Add'}
      >
        <div className="flex flex-col gap-xs">
          <Label htmlFor="cur-code" required>
            Code
          </Label>
          <Input
            id="cur-code"
            list={CODE_DATALIST_ID}
            value={form.code}
            disabled={form.id !== null}
            onChange={(e) => onCodeChange(e.target.value)}
            placeholder="e.g. USD"
            maxLength={3}
          />
        </div>

        <div className="flex flex-col gap-xs">
          <Label htmlFor="cur-symbol" required>
            Symbol
          </Label>
          <Input
            id="cur-symbol"
            value={form.symbol}
            onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))}
            placeholder="e.g. $"
            maxLength={5}
          />
        </div>

        <div className="flex flex-col gap-xs md:col-span-2">
          <Label htmlFor="cur-name" required>
            Name
          </Label>
          <Input
            id="cur-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. US Dollar"
          />
        </div>

        <div className="flex flex-col gap-xs md:col-span-2">
          <Label htmlFor="cur-colour">Colour</Label>
          <ColourPicker
            id="cur-colour"
            value={form.colour}
            onChange={(colour) => setForm((f) => ({ ...f, colour }))}
            vivid={form.vivid}
            onVividChange={(vivid) => setForm((f) => ({ ...f, vivid }))}
          />
        </div>

        <label className="flex items-center gap-sm md:col-span-2">
          <Toggle
            checked={form.isDisplayActive}
            onChange={(isDisplayActive) => setForm((f) => ({ ...f, isDisplayActive }))}
            aria-label="Display active"
          />
          <span className="text-sm text-text-secondary">
            Show in the currency switcher (display-active)
          </span>
        </label>
      </EntityModal>

      <ConfirmationDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) doDelete(confirmDelete)
        }}
        title="Delete currency"
        message={
          confirmDelete
            ? `Permanently delete "${confirmDelete.code} — ${confirmDelete.name}"? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
      />
    </div>
  )
}
