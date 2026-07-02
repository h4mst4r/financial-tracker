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
        {/* <main> owns the routed-content gutter (UX §8, --page-gutter: 24 ≥ md / 16 < md) so no page
            hand-rolls it. < md the bottom padding is raised to clear the fixed mobile Menu bar (UX §17,
            --nav-mobile-h 48px) — a longhand pb override of the gutter shorthand; ≥ md there is no bar,
            so the 24px gutter bottom stands. */}
        <main className="flex-1 overflow-y-auto scrollbar-gutter-stable p-page-gutter max-md:pb-nav-mobile">
          {children}
        </main>
      </div>
    </div>
  )
}
