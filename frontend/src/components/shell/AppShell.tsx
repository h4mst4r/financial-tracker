import { type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

/** The persistent authenticated chrome (UX §1.1, ARCH §6.5 branch 5): Sidebar + Topbar around the
 *  routed content. The ToastContainer stays OUTSIDE this shell (in main.tsx) so toasts aren't trapped
 *  by the sidebar stacking context (ARCH §6.1). */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div data-testid="app-shell" className="flex h-screen bg-bg text-text-strong">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        {/* < md reserve bottom space for the fixed mobile Menu bar (UX §17, --nav-mobile-h) so scrolled
            content never hides behind it; ≥ md there is no bottom bar. */}
        <main className="flex-1 overflow-y-auto scrollbar-gutter-stable pb-nav-mobile md:pb-0">{children}</main>
      </div>
    </div>
  )
}
