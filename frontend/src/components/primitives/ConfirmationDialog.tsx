import { type ReactNode } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'

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
}: ConfirmationDialogProps) {
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
            variant={destructive ? 'danger' : 'primary'}
            disabled={busy}
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
    </Modal>
  )
}
