import { type ReactNode, useEffect, useId, useState } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'
import { Input } from './Input'
import { Label } from './Label'

interface ConfirmationDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  /** Disables both buttons while an action settles — e.g. the accept/decline mutation is in flight. */
  busy?: boolean
  /** Forwarded to Modal — when false the X / Escape / backdrop dismissals are suppressed (a mandatory
   *  choice with no surface behind it, e.g. the pending-invitation gate). Defaults to true. */
  dismissible?: boolean
  /** When false, confirm runs `onConfirm()` WITHOUT the built-in `onClose()` — the consumer owns its own
   *  lifecycle (Accept stays mounted until a refetch rehydrates; Go-to-Settings navigates). Defaults to
   *  true (the destructive-decision default: confirm then close). */
  closeOnConfirm?: boolean
  /** The X / Escape / backdrop handler, distinct from the Cancel button's `onClose`. Defaults to
   *  `onClose`; the conflict dialog overrides it so its X is a session-dismiss separate from Decline. */
  onDismiss?: () => void
  /** When set, renders a confirm-input safeguard in the body (UX §Layer-2 — type-to-confirm on high-risk
   *  destructive actions): a labelled <Input> the user must type to exactly match this value before the
   *  primary (destructive) Button enables. Omit for the plain decision dialog (default — unchanged). */
  confirmText?: string
  /** Visible <Label> for the confirm input (e.g. "Household name"). Only rendered when `confirmText` is set. */
  confirmInputLabel?: ReactNode
  /** Accessible name for the confirm input, overriding the visible Label as the a11y name (e.g.
   *  "Type the household name to confirm"). Only applied when `confirmText` is set. */
  confirmInputAriaLabel?: string
}

export function ConfirmationDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = true,
  busy = false,
  dismissible = true,
  closeOnConfirm = true,
  onDismiss,
  confirmText,
  confirmInputLabel,
  confirmInputAriaLabel,
}: ConfirmationDialogProps) {
  const [typed, setTyped] = useState('')
  const inputId = useId()

  // The dialog owns the confirm-input value, so a reopened dialog never carries the previous attempt.
  useEffect(() => {
    if (!open) setTyped('')
  }, [open])

  const matched = confirmText === undefined || typed === confirmText

  return (
    <Modal
      open={open}
      onClose={onDismiss ?? onClose}
      dismissible={dismissible}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'filled'}
            disabled={busy || !matched}
            onClick={() => {
              onConfirm()
              if (closeOnConfirm) onClose()
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {/* A <div> (not <p>) so a rich body — e.g. the invitation icon-circle + Badge — nests validly. */}
      <div className="text-sm text-text-default">{message}</div>
      {confirmText !== undefined && (
        <div className="mt-2xs flex flex-col gap-2xs">
          {confirmInputLabel !== undefined && <Label htmlFor={inputId}>{confirmInputLabel}</Label>}
          <Input
            id={inputId}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            aria-label={confirmInputAriaLabel}
          />
        </div>
      )}
    </Modal>
  )
}
