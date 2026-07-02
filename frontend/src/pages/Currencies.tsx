import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ACTION_ICON } from '../config/iconRegistry'
import { EMPTY_STATE } from '../config/emptyStateRegistry'
import { EntityPage, EntityModal } from '../components/entity'
import { Label } from '../components/primitives/Label'
import { Input } from '../components/primitives/Input'
import { Toggle } from '../components/primitives/Toggle'
import { Badge } from '../components/primitives/Badge'
import { Icon } from '../components/primitives/Icon'
import { ContextMenu } from '../components/primitives/ContextMenu'
import type { ContextMenuEntry } from '../components/primitives'
import { ColourPicker } from '../components/primitives/ColourPicker'
import { Dropdown } from '../components/primitives/Dropdown'
import { useFormValidation, REQUIRED_FIELDS_NOTE } from '../components/primitives/behaviors'
import { ConfirmationDialog } from '../components/primitives/ConfirmationDialog'
import { MiniSparkline } from '../components/primitives/MiniSparkline'
import { NumberValue } from '../components/primitives/NumberValue'
import { statusTone, BADGE_VARIANT_FOR_TONE, type StatusKey } from '../config/statusRegistry'
import { useAlertStore } from '../stores/alertStore'
import { useThemeStore } from '../stores/themeStore'
import { resolveTheme } from '../theme/useAppearance'
import { resolveEntityColour, enforceTextOnSurface } from '../theme/colour'
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
  relativeAge,
  staleHours,
  absoluteRateTime,
} from '../lib/currency'

// Currencies page (UX §10). EntityPage scaffold over a bespoke FX table (there's no Table primitive
// until Epic 5; the bible's `ledger` CSS is bible-only). Currencies are flat config rows — no
// archive/status — so this uses a plain useQuery + api mutations, NOT useEntityManager. FX fetch
// (Story 3.7), fee editing + the FX-history mini-chart (Story 3.8), and the topbar display-currency
// switcher (Story 9.7) are deliberately out of scope.

const CODE_RE = /^[A-Z]{3}$/

// Currency-freshness status → Badge variant via the §4 registry (no inline status→tone mapping; B7/L6).
const freshnessVariant = (key: StatusKey<'currencyFreshness'>) =>
  BADGE_VARIANT_FOR_TONE[statusTone('currencyFreshness', key)]

interface FormState {
  id: string | null
  code: string
  name: string
  symbol: string
  colour: string
  vivid: boolean
  isDisplayActive: boolean
  isBase: boolean
  feePct: string
}

const EMPTY_FORM: FormState = {
  id: null,
  code: '',
  name: '',
  symbol: '',
  colour: colourForCode(''),
  vivid: false,
  isDisplayActive: true,
  isBase: false,
  feePct: '0',
}

export function Currencies() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Currency | null>(null)
  const pushToast = useAlertStore((s) => s.pushToast)
  // A currency's own colour is role-4 entity identity (UX §0.1), so it must theme like any other
  // entity colour: remapped onto the active palette's ramp under an immersive theme (SCP 2026-06-22
  // colour-system-contract). The code is rendered as TEXT on the page surface, so after the remap it
  // also gets the §0.11 contrast floor against that surface — the remap alone can leave a pale colour
  // unreadable. The surface hex is the live theme value, read once per theme.
  const theme = resolveTheme(useThemeStore((s) => s.theme))
  // `theme` IS the real dependency — it drives the live --color-surface value that getComputedStyle
  // reads off <html>; eslint can't see that cross-the-DOM link, so the dep is intentional, not unused.
  const surfaceHex = useMemo(
    () => getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme],
  )
  const currencyColour = (c: Currency) =>
    enforceTextOnSurface(
      resolveEntityColour(c.colour ?? colourForCode(c.code), c.id, theme).colour,
      surfaceHex,
    )

  // ISO-4217 options for the searchable code picker — value = code, label = "USD — US Dollar",
  // searchText lets typing either the code or the name filter. Derived from the runtime `Intl`.
  const codeOptions = useMemo(
    () =>
      isoCurrencyCodes().map((code) => ({
        value: code,
        label: `${code} — ${currencyName(code)}`,
        searchText: `${code} ${currencyName(code)}`,
      })),
    [],
  )

  const query = useQuery({
    queryKey: ['currencies'],
    queryFn: async () => (await api.get<EntityListResponse<Currency>>('/api/currencies')).data,
    // Window-focus refetch is how the daily FX refresh surfaces in-session (the global default is
    // off, main.tsx). There is no manual in-app trigger (UX §10).
    refetchOnWindowFocus: true,
  })
  const currencies = query.data?.items ?? []
  const baseCode = currencies.find((c) => c.is_base)?.code ?? 'SGD'
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['currencies'] })

  // "Exchange rates updated." toast (AC3): when a refetch lands a newer last_rate_at than the
  // session last saw, confirm it once. The ref is just an edge-detector over TanStack's data — the
  // query stays the source of truth (no server state copied into component state). Skip the initial
  // load (seenMax starts null) so the first fetch never toasts.
  const seenMaxRef = useRef<string | null>(null)
  const maxLastRate = currencies.reduce<string | null>(
    (max, c) => (!c.is_base && c.last_rate_at && (max === null || c.last_rate_at > max) ? c.last_rate_at : max),
    null,
  )
  useEffect(() => {
    if (maxLastRate === null) return
    if (seenMaxRef.current !== null && maxLastRate > seenMaxRef.current) {
      pushToast({ variant: 'success', message: 'Exchange rates updated.' })
    }
    seenMaxRef.current = maxLastRate
  }, [maxLastRate, pushToast])

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
      isBase: c.is_base,
      // fee_pct is the percentage number itself (1.5 = 1.5%) — shown/saved as-is, no conversion.
      feePct: c.fee_pct,
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
    setSaving(true)
    try {
      if (form.id) {
        // The FX fee (percentage number, as-is) is editable only for a non-base currency.
        const patch = form.isBase ? payload : { ...payload, fee_pct: Number(form.feePct) }
        await api.patch(`/api/currencies/${form.id}`, patch)
      } else {
        await api.post('/api/currencies', { code, ...payload })
      }
      invalidate()
      setModalOpen(false)
    } catch (err) {
      // 409 (duplicate code) / 400 (bad code) surface here, keeping the modal open.
      toastError(err, 'Could not save the currency.')
    } finally {
      setSaving(false)
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

  // UX §6 — Save is never disabled for missing fields (only while a save is in-flight); a submit attempt
  // reddens + shakes the offending Field, focuses the first, and shows the summary note. Colour is always
  // a valid hex from the picker.
  const validation = useFormValidation({
    fields: [
      { id: 'cur-code', invalid: !CODE_RE.test(form.code.trim().toUpperCase()) },
      { id: 'cur-symbol', invalid: form.symbol.trim() === '' },
      { id: 'cur-name', invalid: form.name.trim() === '' },
      { id: 'cur-colour', invalid: !/^#[0-9a-fA-F]{6}$/.test(form.colour) },
    ],
  })

  const rowMenu = (c: Currency): ContextMenuEntry[] => {
    const items: ContextMenuEntry[] = [{ label: 'Edit', icon: ACTION_ICON.edit, onClick: () => openEdit(c) }]
    // The base currency is fixed and non-removable (AC2) — no Delete entry.
    if (!c.is_base) {
      items.push({ divider: true })
      items.push({
        label: 'Delete',
        icon: ACTION_ICON.delete,
        destructive: true,
        onClick: () => setConfirmDelete(c),
      })
    }
    return items
  }

  return (
    <div>
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
        emptyIcon={EMPTY_STATE.currencies.icon}
        emptyTitle={EMPTY_STATE.currencies.title}
        emptyDescription={EMPTY_STATE.currencies.description}
      >
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm" data-testid="currencies-table">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
                <th className="px-md py-sm font-medium">Code</th>
                <th className="px-md py-sm font-medium">Name</th>
                <th className="px-md py-sm font-medium">Rate</th>
                <th className="px-md py-sm font-medium">Status</th>
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
                        currency's own colour is entity-identity DATA, resolved through the theme
                        (immersive ramp-snap) before being applied via inline style. */}
                    <td
                      className="px-md py-sm font-mono font-semibold"
                      style={{ color: currencyColour(c) }}
                    >
                      {c.code}
                    </td>
                    <td className="px-md py-sm text-text-strong">{c.name}</td>
                    <td className="px-md py-sm font-mono text-text-default">
                      {displayRate(c.rate_to_base, baseCode, c.code, c.is_base)}
                    </td>
                    {/* Status (UX §10): base = fresh (no time, matches bible §10); non-base shows the
                        freshness badge with the last-updated time, absolute on hover. */}
                    <td className="px-md py-sm">
                      {c.is_base ? (
                        <Badge variant={freshnessVariant('fresh')}>fresh</Badge>
                      ) : c.last_rate_at === null ? (
                        <Badge variant={freshnessVariant('never')}>never</Badge>
                      ) : (
                        <span title={absoluteRateTime(c.last_rate_at)}>
                          <Badge variant={freshnessVariant(stale ? 'stale' : 'fresh')}>
                            {stale
                              ? `stale ${staleHours(c.last_rate_at)}h`
                              : `fresh · ${relativeAge(c.last_rate_at)}`}
                          </Badge>
                        </span>
                      )}
                    </td>
                    {/* Fee = fee_pct as the percentage number, shown as-is (ARCH §3.8 fee convention). */}
                    <td className="px-md py-sm font-mono text-text-default">
                      {c.is_base ? '—' : <NumberValue value={c.fee_pct} decimals={1} suffix="%" />}
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
                    {/* History (FX-rate mini-chart, FR-CU-009): the currency's own colour; the atom
                        shows "no history yet" for < 2 points. onExpand→Viewer is the Epic 9 seam. */}
                    <td className="px-md py-sm">
                      {c.is_base ? (
                        <span className="text-text-muted">—</span>
                      ) : (
                        <MiniSparkline
                          data={c.rate_history}
                          colour={currencyColour(c)}
                          variant="line"
                          className="w-sparkline"
                          aria-label={`${c.code} rate history`}
                        />
                      )}
                    </td>
                    <td className="px-md py-sm text-right">
                      <ContextMenu
                        trigger={
                          <Icon
                            icon={ACTION_ICON.more}
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

      <EntityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.id ? 'Edit currency' : 'New currency'}
        onSave={() => validation.submit(handleSave)}
        saveDisabled={saving}
        errorSummary={validation.showSummary ? REQUIRED_FIELDS_NOTE : undefined}
        shakeSave={validation.shaking}
        saveLabel={form.id ? 'Save' : 'Add'}
      >
        <div className="flex flex-col gap-xs">
          <Label htmlFor="cur-code" required>
            Code
          </Label>
          {/* Searchable Dropdown over the runtime ISO-4217 list (§7 variant) — matches the app's other
              pickers, not a native <datalist>. Read-only on edit: the code is the row's identity. */}
          <Dropdown
            id="cur-code"
            searchable
            value={form.code}
            options={codeOptions}
            disabled={form.id !== null}
            onChange={onCodeChange}
            placeholder="Search ISO 4217…"
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
            error={validation.errors['cur-symbol']}
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
            error={validation.errors['cur-name']}
          />
        </div>

        <div className="flex flex-col gap-xs md:col-span-2">
          <Label htmlFor="cur-colour">Colour</Label>
          {/* Currency identity is TEXT-ONLY (UX §5 — the code/name's colour, no fill), so the vivid-fill
              toggle is meaningless here: a text-only entity has no fill to be vivid (§3). */}
          <ColourPicker
            id="cur-colour"
            value={form.colour}
            onChange={(colour) => setForm((f) => ({ ...f, colour }))}
            vivid={form.vivid}
            onVividChange={(vivid) => setForm((f) => ({ ...f, vivid }))}
            showVivid={false}
          />
        </div>

        {/* FX conversion fee (FR-CU-007) — a percentage number (1.5 = 1.5%), stored as-is. Only for
            a non-base currency being edited (the base has no FX fee; new currencies set it after add). */}
        {form.id !== null && !form.isBase && (
          <div className="flex flex-col gap-xs md:col-span-2">
            <Label htmlFor="cur-fee">FX fee (%)</Label>
            <Input
              id="cur-fee"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={form.feePct}
              onChange={(e) => setForm((f) => ({ ...f, feePct: e.target.value }))}
              placeholder="e.g. 1.5"
            />
          </div>
        )}

        {/* Not a <label>: the Toggle is self-labelled (aria-label) and renders its own control, so a
            wrapping <label> has no associatable control — the visible text is a sibling caption. */}
        <div className="flex items-center gap-sm md:col-span-2">
          <Toggle
            checked={form.isDisplayActive}
            onChange={(isDisplayActive) => setForm((f) => ({ ...f, isDisplayActive }))}
            aria-label="Display active"
          />
          <span className="text-sm text-text-default">
            Show in the currency switcher (display-active)
          </span>
        </div>
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
