import { useState, type CSSProperties, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ACTION_ICON } from '../config/iconRegistry'
import { useEntityColour } from '../theme/useEntityColour'
import { entityEdge } from '../theme/colour'
import { semanticTextClass } from '../theme/semantic'
import { Modal } from '../components/primitives/Modal'
import { Icon } from '../components/primitives/Icon'
import { Input } from '../components/primitives/Input'
import { Dropdown } from '../components/primitives/Dropdown'
import { DatePicker } from '../components/primitives/DatePicker'
import { ConfirmationDialog } from '../components/primitives/ConfirmationDialog'
import { MonetaryValue } from '../components/primitives/MonetaryValue'
import { api } from '../api/client'
import { formatDateDisplay } from '../lib/date'
import { convertForDisplay, cleanAmount, symbolForCode } from '../lib/currency'
import { computeRoi } from '../lib/accountRoi'
import { ACCOUNT_TYPE_ICON, ACCOUNT_TYPE_LABEL } from '../config/accountIcons'
import { useAuthStore } from '../stores/authStore'
import type { Account, AccountSnapshot, AccountSnapshotListOut } from '../types/account'
import type { Currency } from '../types/currency'

// The §8.2b account detail view — a plain READ modal the card opens on tap (FR-A-015/FR-A-016,
// Story 4.11). Two read
// regions — labelled per-subtype detail rows (empty rows hidden) and the value-history inline-editable
// mini-ledger (the pilot for the app-wide inline-cell-edit pattern, §12.3a; Epic 5 generalizes it into
// the Table primitive). Snapshots are always the account's native currency (no picker). Editing the
// ACCOUNT stays in the §8.2 EntityModal (⋮ → Edit) — this surface never edits the account, only snapshots.

const TODAY_ISO = () => new Date().toISOString().slice(0, 10)

const SOURCE_OPTIONS = [
  { value: 'manual', label: 'Manual' },
  { value: 'reconciliation', label: 'Reconciliation' },
  { value: 'appraisal', label: 'Appraisal' },
]
const SOURCE_LABEL: Record<string, string> = Object.fromEntries(
  SOURCE_OPTIONS.map((o) => [o.value, o.label]),
)

interface AccountDetailViewProps {
  open: boolean
  onClose: () => void
  account: Account | null
  currencies: Currency[]
  /** The active display lens — 'native' or an ISO code (Story 4.9). */
  displayCurrency: string
  /** Surfaces a failed write as a page toast (the page owns toasting). */
  onError: (err: unknown) => void
}

export function AccountDetailView({
  open,
  onClose,
  account,
  currencies,
  displayCurrency,
  onError,
}: AccountDetailViewProps) {
  const queryClient = useQueryClient()
  const role = useAuthStore((s) => s.currentPerson?.role)
  const isAdmin = role === 'owner' || role === 'admin'
  // Lifted here (not in the ledger) so the confirm dialog is a SIBLING of this overlay, never a child —
  // a nested confirm renders behind the equal-z-index overlay ([[modal-stacking-portal-zindex]]).
  const [confirmDelete, setConfirmDelete] = useState<AccountSnapshot | null>(null)
  // Theme the panel's entity colour through the resolver (SCP 2026-06-22) — immersive ramp-snap + the
  // contrast floor. Called before the early return to honour the Rules of Hooks.
  const resolved = useEntityColour(account?.colour ?? undefined, account?.id)

  if (!account) return null

  // The detail surface follows the account's own calm/vivid choice, like the card (UX §0.1, §2.5):
  // VIVID = the full colour fill + contrast-pole text; CALM = a soft tint + the theme text pole. Every
  // foreground element inherits this — secondary text mutes via opacity (works in both modes), so we
  // never hardcode text-secondary on a surface that may be a saturated fill.
  const vivid = account.vivid
  const entityVar = (vivid ? resolved?.vividFill : resolved?.colour) ?? 'var(--color-surface-active)'
  const onVar = vivid ? resolved?.on : undefined
  // Every divider/border inside the panel reads --entity-edge (border-entity-edge). On vivid it's the
  // contrast pole washed over the fill (like the chip/scrollbar); on calm it's the entity-tinted edge
  // blended into the neutral border. One value, set once here — no per-element calm/vivid branching.
  const edgeVar = entityEdge({ entityFill: entityVar, onColour: onVar ?? 'var(--color-border)', vivid })

  // A money figure in the active display currency (Story 4.9 lens), rendered through the §7 atom.
  // `nativeCode` is the figure's own currency (the account's, or a snapshot row's); `variant` is
  // `hero` (sans, detail rows / header) or `columnar` (mono, the snapshot ledger).
  const renderMoney = (raw: string | null, nativeCode: string, variant: 'columnar' | 'hero' = 'hero') => {
    if (raw == null) return <MonetaryValue amount={null} currency={nativeCode} variant={variant} />
    const { value, code } = convertForDisplay(raw, nativeCode, displayCurrency, currencies)
    return (
      <MonetaryValue
        amount={String(value)}
        currency={code}
        symbol={symbolForCode(code, currencies)}
        variant={variant}
      />
    )
  }

  const hero =
    account.current_value != null && account.current_value_currency != null
      ? renderMoney(account.current_value, account.current_value_currency, 'hero')
      : <MonetaryValue amount={null} currency={account.currency} variant="hero" />

  const handleDelete = async (snap: AccountSnapshot) => {
    try {
      await api.delete(`/api/accounts/${account.id}/snapshots/${snap.id}`)
      await queryClient.invalidateQueries({ queryKey: ['accounts'] })
      await queryClient.invalidateQueries({ queryKey: ['account-snapshots', account.id] })
    } catch (err) {
      onError(err)
    }
  }

  const identityHeader = (
    <div className="flex items-start gap-sm">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-lg ${
          vivid ? 'bg-entity-chip text-on-entity' : 'bg-entity-chip-calm text-entity'
        }`}
      >
        <Icon icon={ACCOUNT_TYPE_ICON[account.account_type]} size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-entity-default">
          {ACCOUNT_TYPE_LABEL[account.account_type]} · {account.currency}
        </div>
        <div className="text-2xl font-semibold">{hero}</div>
      </div>
    </div>
  )

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={account.name}
        // A roomy read panel (§8.2b) that follows the account's calm/vivid identity. CALM = the opaque
        // entity tint over the raised surface (a translucent fill let the backdrop bleed through). VIVID =
        // the full colour fill + contrast-pole text. Border is the entity-tinted edge in both.
        framePoled
        panelClassName={`w-detail h-detail flex flex-col overflow-hidden border border-entity-edge ${
          vivid ? 'bg-entity-fill-vivid text-on-entity' : 'bg-entity-fill-calm-solid text-entity-fg'
        }`}
        // --entity-colour drives the fill/border/chrome; on vivid it's the floor-enforced fill and
        // --entity-on-colour is the text pole every child inherits. A colourless account falls back to the
        // neutral surface tone so the tints degrade gracefully rather than breaking the color-mix().
        panelStyle={
          {
            '--entity-colour': entityVar,
            '--entity-edge': edgeVar,
            ...(onVar ? { '--entity-on-colour': onVar } : {}),
            // Entity-axis emphasis poles (§2 on the entity surface): vivid mutes the on-colour pole toward
            // the fill; calm (or a vivid account with no resolvable colour → no on-colour) inherits the
            // :root defaults. Gate on `onVar` (not `vivid`) so --entity-fg never references an unset
            // --entity-on-colour (which would invalidate the entity-axis color-mix) — matches EntityCard.
            ...(onVar ? { '--entity-fg': 'var(--entity-on-colour)', '--entity-emph-surface': 'var(--entity-colour)' } : {}),
            // VIVID: the §2 emphasis stops FLOORED against this fill (§0a per-surface floor) — muted/faint
            // stay ≥ their target ratio on a saturated fill, not the neutral-surface fraction under it.
            ...(onVar && resolved
              ? {
                  '--entity-text-default': resolved.vividText.default,
                  '--entity-text-muted': resolved.vividText.muted,
                  '--entity-text-faint': resolved.vividText.faint,
                }
              : {}),
          } as CSSProperties
        }
        bodyClassName="flex-1 overflow-y-auto px-md py-md scrollbar-entity"
      >
        <div className="flex flex-col gap-md">
          {identityHeader}
          <SubtypeDetailRows account={account} vivid={vivid} renderMoney={renderMoney} displayCurrency={displayCurrency} currencies={currencies} />
          <SnapshotLedger
            account={account}
            vivid={vivid}
            isAdmin={isAdmin}
            renderMoney={renderMoney}
            onError={onError}
            onRequestDelete={setConfirmDelete}
          />
        </div>
      </Modal>

      <ConfirmationDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        title="Delete snapshot"
        message={
          confirmDelete
            ? `Delete the ${formatDateDisplay(confirmDelete.snapshot_date)} snapshot (${confirmDelete.currency} ${confirmDelete.value})? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
      />
    </>
  )
}

// ── Subtype detail rows (§8.2b) — labelled label→value rows, empty rows hidden. ONLY the spec-authorized
// rows per subtype (P0 fence). Money rows render through the display lens; the rest verbatim. ──

interface RowsProps {
  account: Account
  vivid: boolean
  renderMoney: (raw: string | null, nativeCode: string, variant?: 'columnar' | 'hero') => ReactNode
  displayCurrency: string
  currencies: Currency[]
}

function SubtypeDetailRows({ account, vivid, renderMoney, displayCurrency, currencies }: RowsProps) {
  const rows: { label: string; node: ReactNode }[] = []
  const money = (label: string, raw: string | null) => {
    if (raw != null) rows.push({ label, node: renderMoney(raw, account.currency) })
  }
  const text = (label: string, value: string | number | null) => {
    if (value != null && value !== '') rows.push({ label, node: String(value) })
  }

  if (account.account_type === 'insurance') {
    money('Death', account.coverage_death)
    money('TPD', account.coverage_tpd)
    money('Critical Illness', account.coverage_ci)
    money('Early CI', account.coverage_early_ci)
    money('Personal Accident', account.coverage_personal_accident)
    text('Hospital', account.coverage_hospital)
    money('Surrender value', account.surrender_value)
  } else if (account.account_type === 'credit_card') {
    if (account.reward_type != null)
      text(
        'Rewards',
        account.reward_points != null
          ? `${account.reward_type} · ${account.reward_points}`
          : account.reward_type,
      )
    text('Billing day', account.billing_day)
    money('Annual fee', account.annual_fee)
    money('Bonus limit', account.bonus_limit)
    text('Points expiry', account.points_expiry)
  } else if (account.account_type === 'bank') {
    text('Account number', account.account_number)
    money('Reserved amount', account.reserved_amount)
    if (account.interest_rate != null)
      text(
        'Interest',
        account.interest_frequency
          ? `${Number(account.interest_rate)}% · ${account.interest_frequency}`
          : `${Number(account.interest_rate)}%`,
      )
  } else if (account.account_type === 'capital') {
    money('Cost basis', account.cost_basis)
    const roi = computeRoi(account, currencies, displayCurrency)
    if (roi) {
      // Semantic gain/loss yields to the contrast pole on a vivid fill (SCP 2026-06-22) — so the tone
      // is the wrapper's, not the atom's `signColour` (which would force the neutral semantic hue).
      const tone = semanticTextClass(roi.delta === 0 ? null : roi.delta > 0 ? 'success' : 'error', vivid)
      rows.push({
        label: 'ROI',
        node: (
          <span className={tone}>
            <MonetaryValue
              amount={String(roi.delta)}
              currency={roi.code}
              symbol={symbolForCode(roi.code, currencies)}
              showSign
            />
          </span>
        ),
      })
    }
  } else if (account.account_type === 'asset') {
    text('Purchase date', account.purchase_date ? formatDateDisplay(account.purchase_date) : null)
    money('Purchase value', account.purchase_value)
    text('Registration no.', account.registration_no)
  }

  if (rows.length === 0) return null
  return (
    <dl className="flex flex-col">
      {rows.map((r) => (
        <div
          key={r.label}
          className="flex items-center justify-between gap-sm border-b border-entity-edge py-xs last:border-0"
        >
          <dt className="text-sm text-entity-default">{r.label}</dt>
          <dd className="text-sm font-medium">{r.node}</dd>
        </div>
      ))}
    </dl>
  )
}

// ── Value-history inline-editable mini-ledger (§8.2b/§12.3a) — THE inline-cell-edit pilot. Double-click
// a cell (admin/owner; desktop/tablet — a mobile tap never fires dblclick, so the ledger is read-only on
// a phone for free) → the typed editor → commit on selection (date/source) or Enter/blur (value/note);
// optimistic + rollback. Inline add-row + per-row delete. Epic 5 lifts this contract into Table<T>. ──

type EditableField = 'snapshot_date' | 'value' | 'source' | 'note'

// A valid monetary amount for commit/add — the single guard shared by the inline value edit and the
// add-row (an empty/non-numeric draft must never reach the PATCH/POST).
const isAmount = (v: string): boolean => /^-?\d+(\.\d+)?$/.test(v.trim())

// The native-currency amount editor: a static currency code (snapshots are always the account's own
// currency — no picker, §8.2b / Story 4.11 feedback) + a mono numeric input. Commits on Enter / blur-out,
// cancels on Esc.
function AmountEditor({
  currency,
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  currency: string
  value: string
  onChange: (v: string) => void
  onCommit: () => void
  onCancel: () => void
}) {
  return (
    <span
      // Presentational wrapper delegating Enter/Esc from the inner amount editor (the real control).
      role="presentation"
      className="flex items-center gap-2xs"
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit()
        if (e.key === 'Escape') onCancel()
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) onCommit()
      }}
    >
      <span className="shrink-0 text-2xs text-entity-muted">{currency}</span>
      <Input
        autoFocus
        inputMode="decimal"
        placeholder="0.00"
        className="font-mono"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </span>
  )
}

interface LedgerProps {
  account: Account
  vivid: boolean
  isAdmin: boolean
  renderMoney: (raw: string | null, nativeCode: string, variant?: 'columnar' | 'hero') => ReactNode
  onError: (err: unknown) => void
  onRequestDelete: (snap: AccountSnapshot) => void
}

function SnapshotLedger({ account, vivid, isAdmin, renderMoney, onError, onRequestDelete }: LedgerProps) {
  const queryClient = useQueryClient()
  const key = ['account-snapshots', account.id]
  const isInsurance = account.account_type === 'insurance'

  const snapshotsQuery = useQuery({
    queryKey: key,
    queryFn: async () =>
      (await api.get<AccountSnapshotListOut>(`/api/accounts/${account.id}/snapshots`)).data,
    enabled: account != null,
  })
  const items = snapshotsQuery.data?.items ?? []

  // The cell under edit + its working value (a snapshot is always the account's native currency, so the
  // value editor carries a single amount string — no currency).
  const [editing, setEditing] = useState<{ id: string; field: EditableField } | null>(null)
  const [draftText, setDraftText] = useState('')
  const [draftAmount, setDraftAmount] = useState('')

  const [adding, setAdding] = useState(false)
  const [addDate, setAddDate] = useState(TODAY_ISO())
  const [addAmount, setAddAmount] = useState('')
  const [addSource, setAddSource] = useState('manual')

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['accounts'] })
    await queryClient.invalidateQueries({ queryKey: key })
  }

  // Optimistic single-field PATCH with rollback (the §12.3a commit contract Epic 5 inherits).
  const patchField = async (snap: AccountSnapshot, body: Partial<AccountSnapshot>) => {
    setEditing(null)
    const prev = queryClient.getQueryData<AccountSnapshotListOut>(key)
    queryClient.setQueryData<AccountSnapshotListOut>(key, (old) =>
      old ? { ...old, items: old.items.map((i) => (i.id === snap.id ? { ...i, ...body } : i)) } : old,
    )
    try {
      await api.patch(`/api/accounts/${account.id}/snapshots/${snap.id}`, body)
      await invalidate()
    } catch (err) {
      queryClient.setQueryData(key, prev) // rollback the optimistic cell
      onError(err)
    }
  }

  const startEdit = (snap: AccountSnapshot, field: EditableField) => {
    if (!isAdmin) return
    setEditing({ id: snap.id, field })
    setDraftText(field === 'snapshot_date' ? snap.snapshot_date : field === 'source' ? snap.source : (snap.note ?? ''))
    setDraftAmount(cleanAmount(snap.value)) // clean prefill — no 13000.0000
  }

  const commitText = (snap: AccountSnapshot, field: EditableField) => {
    const body = field === 'note' ? { note: draftText.trim() || null } : { [field]: draftText }
    patchField(snap, body as Partial<AccountSnapshot>)
  }

  const handleAdd = async () => {
    try {
      await api.post(`/api/accounts/${account.id}/snapshots`, {
        snapshot_date: addDate,
        value: addAmount,
        currency: account.currency, // snapshots are always the account's native currency
        source: addSource,
      })
      await invalidate()
      setAdding(false)
      setAddDate(TODAY_ISO())
      setAddAmount('')
      setAddSource('manual')
    } catch (err) {
      onError(err)
    }
  }

  const isEditing = (id: string, field: EditableField) =>
    editing?.id === id && editing.field === field

  const valueHeader = isInsurance ? 'Surrender value' : 'Value'
  const labelFor: Record<EditableField, string> = {
    snapshot_date: 'date',
    value: 'value',
    source: 'source',
    note: 'note',
  }
  // A read cell: a double-clickable button for admin/owner (opens the typed editor), a plain span for a
  // member (read-only — no affordance, no edit aria-label). Mobile gets read-only for free: a tap never
  // fires onDoubleClick, so cell editing is desktop/tablet-only without a viewport check (§12.3a).
  const readCell = (snap: AccountSnapshot, field: EditableField, content: ReactNode, cls: string) =>
    isAdmin ? (
      <button
        type="button"
        className={`truncate text-left ${cls}`}
        onDoubleClick={() => startEdit(snap, field)}
        aria-label={`Edit the ${formatDateDisplay(snap.snapshot_date)} ${labelFor[field]}`}
      >
        {content}
      </button>
    ) : (
      <span className={`truncate ${cls}`}>{content}</span>
    )

  // The panel sets the foreground pole for BOTH modes (text-on-entity on vivid, text-entity-fg on calm);
  // every text element INHERITS it and mutes via the §2 entity-axis emphasis utilities (the pole mixed
  // toward the entity surface, §0.11 floor preserved — NOT opacity, which bleeds the bg, B13). Icons take
  // the full instance hue on calm and the pole on vivid (text-entity = the fill on vivid, so it'd vanish).
  // Hovers wash the surface with an entity tint, never a neutral surface token.
  const primary = ''
  const secondary = 'text-entity-default'
  const muted = 'text-entity-muted'
  const iconTint = vivid ? 'text-entity-default' : 'text-entity'
  const rowHover = vivid ? 'hover:bg-entity-chip' : 'hover:bg-entity-chip-calm'

  const th = `border-b border-entity-edge px-sm py-2xs text-2xs font-medium uppercase tracking-wide ${muted}`
  const td = 'border-b border-entity-edge px-sm py-xs align-middle'

  return (
    // entity-controls: the snapshot add-row / inline-edit controls recess from the entity surface (§1
    // inset) instead of the flat navy surface-raised — the box matches the card; the portalled picker
    // panels stay the standard overlay surface (they live in <body>, outside this scope).
    <div className={`entity-controls ${vivid ? 'vivid' : 'calm'} flex flex-col gap-xs`}>
      <div className={`text-sm font-medium ${primary}`}>Value history</div>
      {items.length === 0 && !isAdmin ? (
        <span className={`text-sm ${secondary}`}>No snapshots yet</span>
      ) : (
        <div className="overflow-hidden rounded-md border border-entity-edge">
          {/* The generic ledger table (bible .ledger / Table primitive, §7/§12): th left/num-right,
              td border-bottom, row hover. Scrolls past max-h-ledger as the history accumulates. */}
          <div className="max-h-ledger overflow-y-auto scrollbar-entity">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={`${th} text-left`}>Date</th>
                  <th className={`${th} text-right`}>{valueHeader}</th>
                  <th className={`${th} text-left`}>Source</th>
                  {isAdmin && <th className={`${th} w-8`} aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td className={`px-sm py-xs ${secondary}`} colSpan={isAdmin ? 4 : 3}>
                      No snapshots yet
                    </td>
                  </tr>
                )}
                {items.map((snap) => (
                  <tr key={snap.id} className={rowHover}>
                    <td className={td}>
                      {isEditing(snap.id, 'snapshot_date') ? (
                        // Esc exits the cell (§12.3a); the picker's own outside-click closes its popup.
                        <span role="presentation" onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}>
                          <DatePicker value={snap.snapshot_date} onChange={(iso) => patchField(snap, { snapshot_date: iso })} />
                        </span>
                      ) : (
                        readCell(snap, 'snapshot_date', formatDateDisplay(snap.snapshot_date), primary)
                      )}
                    </td>
                    <td className={`${td} text-right`}>
                      {isEditing(snap.id, 'value') ? (
                        <AmountEditor
                          currency={account.currency}
                          value={draftAmount}
                          onChange={setDraftAmount}
                          onCommit={() =>
                            isAmount(draftAmount) ? patchField(snap, { value: draftAmount }) : setEditing(null)
                          }
                          onCancel={() => setEditing(null)}
                        />
                      ) : (
                        readCell(snap, 'value', renderMoney(snap.value, snap.currency, 'columnar'), `ml-auto block w-fit font-mono ${primary}`)
                      )}
                    </td>
                    <td className={td}>
                      {isEditing(snap.id, 'source') ? (
                        <span role="presentation" onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}>
                          <Dropdown value={snap.source} options={SOURCE_OPTIONS} onChange={(v) => patchField(snap, { source: v })} />
                        </span>
                      ) : (
                        readCell(snap, 'source', SOURCE_LABEL[snap.source] ?? snap.source, secondary)
                      )}
                    </td>
                    {isAdmin && (
                      <td className={`${td} text-right`}>
                        <button
                          type="button"
                          className={vivid ? 'text-entity-muted hover:text-entity-strong' : 'text-entity hover:text-error'}
                          aria-label={`Delete the ${formatDateDisplay(snap.snapshot_date)} snapshot`}
                          onClick={() => onRequestDelete(snap)}
                        >
                          <Icon icon={ACTION_ICON.delete} size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Inline add-row (admin) — pinned below the scroll. Native currency only. */}
          {isAdmin &&
            (adding ? (
              <div className="grid grid-cols-snapshot-row items-center gap-xs border-t border-entity-edge px-sm py-xs text-sm">
                <DatePicker value={addDate} onChange={setAddDate} />
                <span className="flex items-center gap-2xs">
                  <span className={`shrink-0 text-2xs ${muted}`}>{account.currency}</span>
                  <Input
                    inputMode="decimal"
                    placeholder="0.00"
                    className="font-mono"
                    value={addAmount}
                    onChange={(e) => setAddAmount(e.target.value)}
                  />
                </span>
                <Dropdown value={addSource} options={SOURCE_OPTIONS} onChange={setAddSource} />
                <button
                  type="button"
                  className={`text-xs font-medium disabled:text-entity-faint disabled:cursor-not-allowed ${vivid ? '' : 'text-primary'}`}
                  disabled={!isAmount(addAmount)}
                  onClick={handleAdd}
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="flex w-full items-center gap-xs border-t border-entity-edge px-sm py-xs text-sm text-entity-muted hover:text-entity-strong"
                onClick={() => setAdding(true)}
              >
                <Icon icon={ACTION_ICON.add} size={14} className={iconTint} /> Add snapshot…
              </button>
            ))}
        </div>
      )}

      {/* The note editor is a full-width row under the table (notes aren't a fixed column on small
          surfaces). Admin sees a row per snapshot so a first note can be added (empty → a muted "add
          note" affordance); a member sees only rows that already have a note. Double-click to edit. */}
      {(isAdmin || items.some((s) => s.note)) && (
        <ul className="flex flex-col gap-2xs">
          {items
            .filter((s) => isAdmin || s.note)
            .map((snap) => (
              <li key={snap.id} className={`text-xs ${muted}`}>
                {isEditing(snap.id, 'note') ? (
                  <Input
                    autoFocus
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitText(snap, 'note')
                      if (e.key === 'Escape') setEditing(null)
                    }}
                    onBlur={() => commitText(snap, 'note')}
                  />
                ) : (
                  readCell(
                    snap,
                    'note',
                    snap.note
                      ? `${formatDateDisplay(snap.snapshot_date)}: ${snap.note}`
                      : `${formatDateDisplay(snap.snapshot_date)}: + add note`,
                    snap.note ? '' : `italic ${muted}`,
                  )
                )}
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}
