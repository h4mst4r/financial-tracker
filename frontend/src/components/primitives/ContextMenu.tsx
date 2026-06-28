import { useState, useRef, useEffect, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Icon } from './Icon'
import { Portal } from './behaviors/Portal'
import { usePopover } from './behaviors/usePopover'
import { useMenu } from './behaviors/useMenu'
import { usePressable } from './behaviors/usePressable'

export interface ContextMenuItem {
  label: string
  icon?: LucideIcon
  onClick: () => void
  disabled?: boolean
  disabledReason?: string
  destructive?: boolean
  /** Non-mutating "special" actions tinted apart from plain edits (UX §8.1):
   *  'favourite' = star/gold, 'open' = accent-secondary. */
  tone?: 'favourite' | 'open'
}

export interface ContextMenuDivider {
  divider: true
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuDivider

interface ContextMenuProps {
  trigger: ReactNode
  items: ContextMenuEntry[]
}

export function ContextMenu({ trigger, items }: ContextMenuProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ x: -9999, y: -9999 }) // offscreen until positioned (no flash)
  const triggerRef = useRef<HTMLElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Navigable rows exclude dividers AND disabled entries (disabled is a dead stop, never focused/activated).
  const actionableItems = items.filter(
    (i): i is ContextMenuItem => !('divider' in i) && !i.disabled,
  )

  const handleClose = () => {
    setOpen(false)
    setPosition({ x: -9999, y: -9999 })
    setActiveIndex(-1)
  }

  // Menu behavior: roving keyboard (↑↓ Enter Esc) over the actionable rows. Enter activates; Escape
  // closes and returns focus to the trigger (outside-click does NOT refocus — Popover handles that path).
  const { activeIndex, setActiveIndex, onKeyDown } = useMenu({
    itemCount: actionableItems.length,
    onActivate: (index) => {
      actionableItems[index].onClick()
      handleClose()
    },
    onClose: () => {
      handleClose()
      triggerRef.current?.focus()
    },
  })

  // Popover behavior: outside-click dismissal (containment = the portalled menu). Escape is owned by the
  // Menu (above) so it can refocus the trigger — turn it off here to avoid a double close.
  usePopover({
    open,
    onClose: handleClose,
    containRef: menuRef,
    dismissOnEscape: false,
  })

  const triggerProps = usePressable({
    host: true,
    onPress: (e) => {
      e?.stopPropagation()
      setOpen(true)
      setActiveIndex(-1)
    },
  })

  // Anchor the menu to the trigger: dropped below it, RIGHT-aligned (kebab convention),
  // re-read from the live trigger rect (not the click event) and clamped/flipped to the viewport.
  // Re-runs on open + on scroll/resize so the menu stays attached (it's position:fixed).
  useEffect(() => {
    if (!open) return
    const reposition = () => {
      const t = triggerRef.current?.getBoundingClientRect()
      const m = menuRef.current?.getBoundingClientRect()
      if (!t || !m) return
      const margin = 8
      let x = t.right - m.width // right edge aligns with the trigger's right edge
      let y = t.bottom + 4
      x = Math.max(margin, Math.min(x, window.innerWidth - m.width - margin))
      if (y + m.height > window.innerHeight - margin) y = Math.max(margin, t.top - m.height - 4) // flip above
      setPosition({ x, y })
    }
    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open])

  // Roving focus: move DOM focus to the actionable menuitem at the active index. The selector excludes
  // disabled buttons so its order matches `actionableItems` (the index space the Menu navigates).
  useEffect(() => {
    if (!open || activeIndex < 0) return
    const buttons = menuRef.current?.querySelectorAll<HTMLButtonElement>(
      'button[role="menuitem"]:not([disabled])',
    )
    buttons?.[activeIndex]?.focus()
  }, [open, activeIndex])

  // The Menu's keyboard is document-level so it works wherever focus lands while the menu is open
  // (matching the original hand-rolled behavior); `onKeyDown` is stable, so the listener never goes stale.
  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onKeyDown])

  return (
    <span className="relative inline-block">
      <span ref={triggerRef} className="cursor-pointer" {...triggerProps}>
        {trigger}
      </span>

      {open && (
        <Portal>
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-dropdown bg-surface-overlay border border-border rounded-md shadow-lg min-w-menu py-2xs"
            style={{ left: position.x, top: position.y }}
          >
            {items.map((entry, idx) => {
              if ('divider' in entry) {
                // border-strong (not the default border-border) — on the surface-overlay menu the
                // plain border token is near-invisible (≈ the overlay colour).
                return (
                  <div
                    key={`div-${idx}`}
                    role="separator"
                    className="my-2xs border-t border-border-strong"
                  />
                )
              }
              const item = entry
              return (
                <button
                  key={`${item.label}-${idx}`}
                  role="menuitem"
                  tabIndex={-1}
                  disabled={item.disabled}
                  onClick={() => {
                    if (!item.disabled) {
                      item.onClick()
                      handleClose()
                    }
                  }}
                  title={item.disabled ? item.disabledReason : undefined}
                  className={`
                    w-full text-left px-sm py-xs text-sm flex items-center gap-xs hover:bg-surface-active
                    ${item.disabled
                      ? 'text-text-muted cursor-not-allowed'
                      : item.destructive
                        ? 'text-error'
                        : item.tone === 'favourite'
                          ? 'text-favourite'
                          : item.tone === 'open'
                            ? 'text-accent'
                            : 'text-text-primary'
                    }
                  `}
                >
                  {item.icon && <Icon icon={item.icon} size={14} />}
                  {item.label}
                </button>
              )
            })}
          </div>
        </Portal>
      )}
    </span>
  )
}
