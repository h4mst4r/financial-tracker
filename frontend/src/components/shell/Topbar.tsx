import { useNavigate } from 'react-router-dom'
import { User, LogOut } from 'lucide-react'
import { Avatar, ContextMenu } from '../primitives'
import type { ContextMenuEntry } from '../primitives'
import { useAuthStore } from '../../stores/authStore'
import { useLogout } from '../../hooks/useLogout'

/** Persistent topbar (UX §1.1). The avatar menu is the sole user menu (profile + sign out). The
 *  left view-context cluster (Epic 9), search/command-palette and alerts bell (Epic 10) are reserved
 *  layout slots — NOT built here (P0). Theme/font pickers remain Story 2.9. */
export function Topbar() {
  const currentPerson = useAuthStore((s) => s.currentPerson)
  const navigate = useNavigate()
  const { logout, isPending } = useLogout()

  // AppShell only mounts in the in-household branch, so currentPerson is non-null; guard defensively.
  if (!currentPerson) return null

  const menuItems: ContextMenuEntry[] = [
    // Profile (personal) → /profile (Story 2.9); the sidebar Settings → /settings is household config
    // (Story 2.5). Both resolve to Not Found until their pages exist.
    { label: 'Profile', icon: User, onClick: () => navigate('/profile') },
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
      {/* Left — reserved view-context slot (Household/Individual + display currency, Epic 9). */}
      <div />
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
