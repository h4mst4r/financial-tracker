import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Icon } from './Icon'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  footer?: ReactNode
  /** When false, the modal can only be closed by its own footer actions — the X, Escape, and
   *  backdrop-click dismissals are all suppressed (e.g. a mandatory Accept/Decline choice with no
   *  surface behind it). Defaults to true. */
  dismissible?: boolean
  /** Override the panel appearance (width + bg + border + any layout). Defaults to the standard surface
   *  modal; the detail view passes the card's fill + border + a big card-ratio size + flex/overflow so
   *  its body scrolls (§8.2b). */
  panelClassName?: string
  /** Override the body wrapper — default `px-md py-md`. The detail view adds `flex-1 overflow-y-auto`
   *  (kept OUT of the default so form modals' dropdowns/pickers are never clipped). */
  bodyClassName?: string
  /** Inline panel style — e.g. the `--entity-colour` for the detail modal's card fill. */
  panelStyle?: CSSProperties
  /** When the panel itself carries an entity fill (the §8.2b detail view), the header chrome rides the
   *  card's contrast pole instead of the neutral theme tokens: the title/X inherit `--entity-on-colour`
   *  (the X mutes via opacity) and the header divider is the entity-tinted edge. Off by default — every
   *  form modal keeps the plain neutral frame. */
  framePoled?: boolean
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  dismissible = true,
  panelClassName = 'w-full max-w-modal bg-surface-raised border border-border',
  bodyClassName = 'px-md py-md',
  panelStyle,
  framePoled = false,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  // Where the most recent press started — so a drag that begins inside the panel (e.g. selecting text
  // in an input) and releases on the backdrop does NOT count as a backdrop dismissal.
  const mouseDownOnBackdrop = useRef(false)
  // Read the latest onClose/dismissible from refs inside the open-scoped effect, so a parent re-render
  // (e.g. typing into a child input, which hands us a fresh onClose closure) does NOT re-run the
  // focus/scroll-lock effect and yank focus back to the panel mid-type.
  const onCloseRef = useRef(onClose)
  const dismissibleRef = useRef(dismissible)
  onCloseRef.current = onClose
  dismissibleRef.current = dismissible
  const titleId = useId()
  // Drives the scale+fade entrance (§0.7): mount at scale-95/opacity-0, then flip to final next frame.
  // duration-base carries --motion-factor, so reduce-motion collapses this to instant.
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    if (!open) {
      setEntered(false)
      return
    }
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [open])

  useEffect(() => {
    if (!open) return
    // Store currently focused element & lock body scroll
    previousFocus.current = document.activeElement as HTMLElement
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Focus trap: move focus into panel
    const timer = setTimeout(() => panelRef.current?.focus({ preventScroll: true }), 50)

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissibleRef.current) onCloseRef.current()
      // Focus trap within panel
      if (e.key === 'Tab') {
        const el = panelRef.current
        if (!el) return
        // Exclude disabled/hidden controls so Tab never lands on a dead element. Filter at the
        // selector level (:not([disabled]):not([hidden])) + drop aria-hidden — NOT via offsetParent,
        // which jsdom always reports null, breaking the trap in tests.
        const focusable = Array.from(
          el.querySelectorAll<HTMLElement>(
            'button:not([disabled]):not([hidden]), [href]:not([hidden]), input:not([disabled]):not([hidden]), select:not([disabled]):not([hidden]), textarea:not([disabled]):not([hidden]), [tabindex]:not([tabindex="-1"]):not([hidden])'
          )
        ).filter((n) => n.getAttribute('aria-hidden') !== 'true')
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last?.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first?.focus()
          }
        }
      }
    }

    document.addEventListener('keydown', handleKey)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = originalOverflow
      // Restore focus
      previousFocus.current?.focus()
    }
  }, [open])

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    mouseDownOnBackdrop.current = e.target === e.currentTarget
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    // Close only when BOTH the press and the release landed on the backdrop itself — a drag that
    // started inside the panel (text selection) and ended here must not dismiss the modal.
    if (e.target === e.currentTarget && mouseDownOnBackdrop.current && dismissible) {
      onClose()
    }
    mouseDownOnBackdrop.current = false
  }

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-center justify-center p-md"
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div
        className={`fixed inset-0 bg-backdrop transition-opacity duration-base ${entered ? 'opacity-100' : 'opacity-0'}`}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        style={panelStyle}
        className={`
          relative z-modal rounded-lg shadow-xl origin-center transition-all duration-base
          ${panelClassName}
          ${entered ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
        `}
      >
        {title && (
          <div
            className={`flex shrink-0 items-center justify-between px-md py-sm border-b ${
              framePoled ? 'border-entity-edge' : 'border-border'
            }`}
          >
            <h2
              id={titleId}
              className={`text-lg font-medium ${framePoled ? '' : 'text-text-primary'}`}
            >
              {title}
            </h2>
            {dismissible && (
              <button
                onClick={onClose}
                aria-label="Close"
                className={
                  framePoled
                    ? 'opacity-70 hover:opacity-100 transition-opacity'
                    : 'text-text-secondary hover:text-text-primary transition-colors'
                }
              >
                <Icon icon={X} size={18} />
              </button>
            )}
          </div>
        )}
        <div className={bodyClassName}>{children}</div>
        {footer && (
          // Cancel left / primary right (§4.2): footer children are direct flex children so
          // justify-between splits them (a single footer element falls to the left, generically).
          <div className="flex items-center justify-between px-md py-sm border-t border-border">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
