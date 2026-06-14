import { useAlertStore } from '../stores/alertStore'

/**
 * Minimal toast container — renders the toast queue.
 * Queue is empty until Epic 2+ pushes toasts, so this renders nothing visible now.
 * Mounted outside AppShell so z-index isn't trapped by a child stacking context.
 * The styled Toast primitive is built later (UX §7).
 */
export function ToastContainer() {
  const toasts = useAlertStore((s) => s.toasts)

  if (toasts.length === 0) return <></>

  return (
    <div className="fixed bottom-md right-md z-toast flex flex-col gap-xs">
      {toasts.map((t) => (
        <div key={t.id} className="rounded-md bg-surface-raised px-md py-xs text-sm text-text-primary shadow-lg">
          {t.message}
        </div>
      ))}
    </div>
  )
}
