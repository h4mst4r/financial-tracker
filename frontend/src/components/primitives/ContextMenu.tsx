import { useState, useRef, useEffect, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

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
  const focusIndexRef = useRef(-1)

  const handleOpen = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation()
    setOpen(true)
    focusIndexRef.current = -1
  }

  const handleClose = () => {
    setOpen(false)
    setPosition({ x: -9999, y: -9999 })
    focusIndexRef.current = -1
  }

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

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        handleClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Esc, keyboard navigation
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      // Navigable items exclude dividers AND disabled entries (disabled is a dead stop, never focused/activated).
      const actionableItems = items.filter(
        (i) => !('divider' in i) && !(i as ContextMenuItem).disabled
      )
      if (e.key === 'Escape') {
        handleClose()
        triggerRef.current?.focus()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        focusIndexRef.current = Math.min(focusIndexRef.current + 1, actionableItems.length - 1)
        focusCurrentItem()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        focusIndexRef.current = Math.max(focusIndexRef.current - 1, 0)
        focusCurrentItem()
      } else if (e.key === 'Enter' && focusIndexRef.current >= 0) {
        e.preventDefault()
        const item = actionableItems[focusIndexRef.current]
        if (item && !('divider' in item)) {
          item.onClick()
          handleClose()
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, items])

  const focusCurrentItem = () => {
    const buttons = menuRef.current?.querySelectorAll<HTMLButtonElement>(
      'button[role="menuitem"]:not([disabled])'
    )
    buttons?.[focusIndexRef.current]?.focus()
  }

  return (
    <span className="relative inline-block">
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        className="cursor-pointer"
        onClick={handleOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleOpen(e)
        }}
      >
        {trigger}
      </span>

      {open && typeof document !== 'undefined' && createPortal(
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
            const item = entry as ContextMenuItem
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
        </div>,
        document.body
      )}
    </span>
  )
}
