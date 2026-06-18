import type { ReactNode } from 'react'

/** NULL-household landing shell (ARCH §6.5 branch 4): a minimal, query-free background. It issues
 *  no household-scoped queries and adds no unauthorized chrome (P0) — it is the mount point the
 *  first-login New Household modal (Story 2.4c) and the invite / conflict dialogs (Story 2.6) will
 *  later occupy. */
export function NeutralShell({ children }: { children?: ReactNode }) {
  return <main className="min-h-screen bg-bg text-text-primary">{children}</main>
}
