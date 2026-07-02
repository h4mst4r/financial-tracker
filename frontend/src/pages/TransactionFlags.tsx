import { Icon } from '../components/primitives/Icon'
import { TRANSACTION_FLAG_ICON } from '../config/iconRegistry'
import type { Transaction } from '../types/event'

// The ledger behavioural-flag icons (UX §751 / §11 `TRANSACTION_FLAG_ICON`, Story 5.5). A muted,
// aria-labelled glyph cluster shown after the Name cell on both the desktop row and the `< md` card:
//   • personal (`UserRound`) — a NON-shared OUTFLOW (shared is the quiet default → no flag; the
//     predicate is outflow-only because an inflow can never be shared, ARCH §3.6 CHECK)
//   • GST-claimable (`Receipt`) — any GST-claimable row (GST is outflow-only per FR-E-010, but the
//     icon just reflects `is_gst_claimable` — the modal is what gates where it can be set)
// These are typed booleans, never tags (ARCH §3.7) → icons, not `Badge`s. Meaning is the glyph +
// aria-label, never colour alone (§11/L15).
export function TransactionFlags({ transaction: t }: { transaction: Transaction }) {
  const personal = !t.is_shared_expense && t.transaction_type === 'outflow'
  const gst = t.is_gst_claimable
  if (!personal && !gst) return null
  return (
    <span className="inline-flex shrink-0 items-center gap-2xs text-text-muted">
      {personal && (
        <Icon icon={TRANSACTION_FLAG_ICON.personal} size={14} aria-label="Personal expense" />
      )}
      {gst && <Icon icon={TRANSACTION_FLAG_ICON.gst} size={14} aria-label="GST-claimable" />}
    </span>
  )
}
