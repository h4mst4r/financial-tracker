import { useNavigate } from 'react-router-dom'
import { User, LogOut } from 'lucide-react'
import { Avatar, ContextMenu } from '../primitives'
import type { ContextMenuEntry } from '../primitives'
import { DisplayCurrencyPicker } from './DisplayCurrencyPicker'
import { useAuthStore } from '../../stores/authStore'
import { useLogout } from '../../hooks/useLogout'

/** Persistent topbar (UX §1.1). The avatar menu is the sole user menu (profile + sign out). The left
 *  view-context cluster holds the display-currency picker (§8.4, Story 4.9); its Household/Individual +
 *  member controls are Story 9.7, and the search/command-palette + alerts bell (Epic 10) are still
 *  reserved layout slots — NOT built here (P0). The persisted theme/font controls live in the
 *  Settings → Profile tab (Story 2.9); the §3.357 inline avatar quick-pickers are a deferred enhancement. */
export function Topbar() {
  const currentPerson = useAuthStore((s) => s.currentPerson)
  const navigate = useNavigate()
  const { logout, isPending } = useLogout()

  // AppShell only mounts in the in-household branch, so currentPerson is non-null; guard defensively.
  if (!currentPerson) return null

  const menuItems: ContextMenuEntry[] = [
    // Profile → the Settings Profile tab (Story 2.9 made it the default tab); the sidebar Settings
    // link targets the same page. Personal preferences vs household config are tabs within /settings.
    { label: 'Profile', icon: User, onClick: () => navigate('/settings') },
    { divider: true },
    // Disable while a logout is in flight so a rapid second click can't fire a 2nd request (whose
    // now-deleted session would 401 → api-client hard-reload, overriding the SPA navigate).
    { label: 'Sign out', icon: LogOut, destructive: true, disabled: isPending, onClick: logout },
  ]

  return (
    <header
      data-testid="topbar"
      className="flex items-center justify-between border-b border-border bg-surface px-md py-sm"
    >
      {/* Left view-context cluster — display-currency picker (§8.4, Story 4.9); Household/Individual +
          member controls are Story 9.7. */}
      <DisplayCurrencyPicker />
      {/* Right cluster — reserved search/command-palette + alerts bell slots (Epic 10), then avatar. */}
      <div className="flex items-center gap-sm">
        <ContextMenu
          trigger={
            <Avatar name={currentPerson.displayName} src={currentPerson.pictureUrl ?? undefined} />
          }
          items={menuItems}
        />
      </div>
    </header>
  )
}
