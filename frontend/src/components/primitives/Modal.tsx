import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  footer?: ReactNode
}

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
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
      if (e.key === 'Escape') onClose()
      // Focus trap within panel
      if (e.key === 'Tab') {
        const el = panelRef.current
        if (!el) return
        const focusable = el.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
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
  }, [open, onClose])

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-center justify-center p-md"
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
        className={`
          relative z-modal bg-surface-raised border border-border rounded-lg shadow-xl
          w-full max-w-modal origin-center
          transition-all duration-base
          ${entered ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
        `}
      >
        {title && (
          <div className="flex items-center justify-between px-md py-sm border-b border-border">
            <h2 id={titleId} className="text-lg font-medium text-text-primary">
              {title}
            </h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-text-secondary hover:text-text-primary transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="px-md py-md">{children}</div>
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
