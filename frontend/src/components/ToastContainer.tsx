import { useEffect, useState } from 'react'
import { useAlertStore, type Toast as ToastModel } from '../stores/alertStore'
import { Toast } from './primitives/Toast'

/** Auto-dismiss window — toasts are transient; persistent notices use the AlertPanel/AlertBanner.
 *  Lives here (the container), NOT in alertStore — the store stays a pure state shape (AC3). */
const TOAST_DURATION_MS = 4000

/** Slide-out/collapse window before the row unmounts. Must cover --duration-base (200ms). Removal is
 *  timer-driven rather than transitionend-driven because a 0s reduce-motion transition fires no
 *  transitionend (which would otherwise leave the toast stuck in the DOM). */
const TOAST_EXIT_MS = 200

/** One queued toast: animates in on mount (slide from the right + height-bump), auto-dismisses, and
 *  animates out (reverse) before removing itself from the store. */
function ToastItem({ toast }: { toast: ToastModel }) {
  const dismissToast = useAlertStore((s) => s.dismissToast)
  // `open` drives every transitioned property (row height, slide, fade); false = off-screen/collapsed.
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Enter on the frame after mount so the transition runs from the collapsed/off-screen start state.
    const enter = requestAnimationFrame(() => setOpen(true))
    let exit: ReturnType<typeof setTimeout>
    const auto = setTimeout(() => {
      setOpen(false)
      exit = setTimeout(() => dismissToast(toast.id), TOAST_EXIT_MS)
    }, TOAST_DURATION_MS)
    return () => {
      cancelAnimationFrame(enter)
      clearTimeout(auto)
      clearTimeout(exit)
    }
  }, [toast.id, dismissToast])

  const handleDismiss = () => {
    setOpen(false)
    setTimeout(() => dismissToast(toast.id), TOAST_EXIT_MS)
  }

  return (
    <div
      className="grid transition-toast duration-base ease-spring"
      style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
    >
      {/* Clip the body while the row collapses so siblings bump against a clean edge. */}
      <div className="overflow-hidden">
        {/* pb-xs (not container gap) so the inter-toast spacing collapses with the row on exit. */}
        <div
          className={`pb-xs transition-toast duration-base ease-spring ${
            open ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
          }`}
        >
          <Toast variant={toast.variant} message={toast.message} onDismiss={handleDismiss} />
        </div>
      </div>
    </div>
  )
}

/**
 * Toast container — renders the toast queue using the styled Toast primitive.
 * Mounted outside AppShell so z-index isn't trapped by a child stacking context. Anchored
 * **bottom-right** (`bottom-toast`), deliberately off the top-right cluster (search · alerts bell ·
 * avatar menu) so a toast never obscures an open menu/panel; `flex-col` keeps the newest toast at the
 * bottom so a freshly-pushed one bumps the older ones up (§0.7).
 */
export function ToastContainer() {
  const toasts = useAlertStore((s) => s.toasts)

  if (toasts.length === 0) return <></>

  return (
    <div className="fixed bottom-toast right-md z-toast flex flex-col">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  )
}
