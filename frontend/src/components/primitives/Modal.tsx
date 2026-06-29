import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ACTION_ICON } from '../../config/iconRegistry'
import { Icon } from './Icon'
import { Portal } from './behaviors/Portal'
import { usePopover } from './behaviors/usePopover'

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
  // Where the most recent press started — so a drag that begins inside the panel (e.g. selecting text
  // in an input) and releases on the backdrop does NOT count as a backdrop dismissal.
  const mouseDownOnBackdrop = useRef(false)
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

  // The modal-tier Popover behavior: focus-trap + scroll-lock + focus-return + Escape (gated on
  // `dismissible`). Outside-click is OFF here — the backdrop dismissal is handled below with the
  // press-started-on-backdrop drag guard, which a generic outside-click can't express.
  usePopover({
    open,
    onClose,
    panelRef,
    dismissOnOutsideClick: false,
    dismissOnEscape: dismissible,
    trapFocus: true,
    lockScroll: true,
    returnFocus: true,
  })

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

  return (
    <Portal>
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
              className={`text-lg font-medium ${framePoled ? '' : 'text-text-strong'}`}
            >
              {title}
            </h2>
            {dismissible && (
              <button
                onClick={onClose}
                aria-label="Close"
                className={
                  framePoled
                    ? 'text-entity-muted hover:text-entity-strong transition-colors'
                    : 'text-text-default hover:text-text-strong transition-colors'
                }
              >
                <Icon icon={ACTION_ICON.close} size={18} />
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
    </div>
    </Portal>
  )
}
