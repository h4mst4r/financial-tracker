import { useEffect } from 'react'
import { useAlertStore, type Toast as ToastModel } from '../stores/alertStore'
import { Toast } from './primitives/Toast'

/** Auto-dismiss window — toasts are transient; persistent notices use the AlertPanel/AlertBanner.
 *  Lives here (the container), NOT in alertStore — the store stays a pure state shape (AC3). */
const TOAST_DURATION_MS = 4000

/** One queued toast + its own auto-dismiss timer (cleaned up on unmount/dismiss). */
function ToastItem({ toast }: { toast: ToastModel }) {
  const dismissToast = useAlertStore((s) => s.dismissToast)
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(toast.id), TOAST_DURATION_MS)
    return () => clearTimeout(timer)
  }, [toast.id, dismissToast])
  return (
    <Toast variant={toast.variant} message={toast.message} onDismiss={() => dismissToast(toast.id)} />
  )
}

/**
 * Toast container — renders the toast queue using the styled Toast primitive.
 * Mounted outside AppShell so z-index isn't trapped by a child stacking context.
 */
export function ToastContainer() {
  const toasts = useAlertStore((s) => s.toasts)

  if (toasts.length === 0) return <></>

  return (
    <div className="fixed top-md right-md z-toast flex flex-col gap-xs">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  )
}
