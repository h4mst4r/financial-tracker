import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Portal } from '../primitives/behaviors/Portal'
import { CONTROL_ICON } from '../../config/iconRegistry'
import { Icon, Tooltip, Divider } from '../primitives'
import { BrandMark } from '../BrandMark'
import { branding } from '../../config/branding'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { NAV_GROUPS, SETTINGS_ITEM, type NavItem } from './navigation'

// Active item: accent-subtle fill + accent-primary text (UX §1.1). `text-primary` is the @utility
// alias for --color-accent-primary (indigo) — NOT the body text colour (which is text-text-strong).
function itemClass(isActive: boolean, rail: boolean): string {
  const base = 'flex items-center gap-sm rounded-md px-sm py-xs text-sm transition-colors'
  const state = isActive
    ? 'bg-accent-subtle text-primary'
    : 'text-text-default hover:bg-surface-active hover:text-text-strong'
  return `${base} ${state} ${rail ? 'justify-center' : ''}`
}

function NavItemLink({ item, rail, onSelect }: { item: NavItem; rail: boolean; onSelect?: () => void }) {
  const link = (
    <NavLink to={item.to} onClick={onSelect} className={({ isActive }) => itemClass(isActive, rail)}>
      <Icon icon={item.icon} />
      {!rail && <span>{item.label}</span>}
    </NavLink>
  )
  // Rail mode hides labels → the label becomes a hover tooltip (UX §1.1, §2.8 CSS-hover Tooltip).
  return rail ? <Tooltip content={item.label}>{link}</Tooltip> : link
}

/** Expanded (≥ lg) or icon-rail (< lg) sidebar (UX §1.1). No identity row — identity is the topbar
 *  avatar (P0). */
function DesktopSidebar({ rail }: { rail: boolean }) {
  return (
    <aside
      data-testid="sidebar"
      className={`z-sidebar flex h-full shrink-0 flex-col border-r border-border bg-surface ${rail ? 'w-sidebar-rail' : 'w-sidebar'}`}
    >
      <div className={`flex items-center gap-sm px-sm py-md ${rail ? 'justify-center' : ''}`}>
        <BrandMark size={rail ? 28 : 32} />
        {!rail && <span className="font-semibold text-text-strong">{branding.wordmark}</span>}
      </div>

      <nav className="flex-1 overflow-y-auto px-2xs">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-sm">
            {rail ? (
              <Divider className="my-2xs" />
            ) : (
              <div className="px-sm pb-2xs pt-sm text-xs font-medium uppercase tracking-wide text-text-muted">
                {group.label}
              </div>
            )}
            {group.items.map((item) => (
              <NavItemLink key={item.to} item={item} rail={rail} />
            ))}
          </div>
        ))}
      </nav>

      <div className="mt-auto border-t border-border px-2xs py-sm">
        <NavItemLink item={SETTINGS_ITEM} rail={rail} />
      </div>
    </aside>
  )
}

/** Mobile (< md): a bottom Menu bar that raises a slide-up sheet with the full grouped nav
 *  (UX §1.1, §0.10). Closes on selection or backdrop/handle tap. */
function MobileNav() {
  const [open, setOpen] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)

  // Esc closes; focus moves into the sheet on open and restores to the trigger on close (UX §0.11).
  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement as HTMLElement | null
    sheetRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previousFocus?.focus()
    }
  }, [open])

  return (
    <>
      <button
        data-testid="mobile-menu-bar"
        onClick={() => setOpen(true)}
        className="z-sidebar fixed inset-x-0 bottom-0 flex items-center justify-center gap-sm border-t border-border bg-surface px-md py-sm text-sm text-text-strong"
      >
        <Icon icon={CONTROL_ICON.menu} /> Menu
      </button>

      {open && (
        <Portal>
          <div className="z-sidebar fixed inset-0 flex flex-col justify-end">
            {/* Presentational dismiss catcher — a sibling of the sheet, so clicks inside the sheet don't
                reach it (no stopPropagation needed); keyboard dismiss is the Close button below. */}
            <div role="presentation" className="absolute inset-0 bg-backdrop" onClick={() => setOpen(false)} />
            <div
              ref={sheetRef}
              role="dialog"
              aria-label="Navigation"
              tabIndex={-1}
              className="relative max-h-bottom-sheet overflow-y-auto rounded-t-lg border-t border-border bg-surface px-sm pb-lg pt-sm"
            >
              <button
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="sheet-handle mx-auto mb-sm block rounded-full bg-border-strong"
              />
              {NAV_GROUPS.map((group) => (
                <div key={group.label} className="mb-sm">
                  <div className="px-sm pb-2xs pt-sm text-xs font-medium uppercase tracking-wide text-text-muted">
                    {group.label}
                  </div>
                  {group.items.map((item) => (
                    <NavItemLink key={item.to} item={item} rail={false} onSelect={() => setOpen(false)} />
                  ))}
                </div>
              ))}
              <div className="mt-sm border-t border-border pt-sm">
                <NavItemLink item={SETTINGS_ITEM} rail={false} onSelect={() => setOpen(false)} />
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  )
}

export function Sidebar() {
  const isMobile = useMediaQuery('(max-width: 767px)') // < md
  const isRail = useMediaQuery('(max-width: 1023px)') // < lg
  if (isMobile) return <MobileNav />
  return <DesktopSidebar rail={isRail} />
}
