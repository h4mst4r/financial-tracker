import { type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Portal — the single sanctioned home for `createPortal`. Every overlay that escapes its DOM parent
// (Modal, ContextMenu, and any future drawer/command-palette) renders its floating layer through this
// instead of calling `createPortal` locally. Centralising it is the L0 contract: no primitive re-rolls
// a portal (the guard in 5f-7 enforces "no bare createPortal outside behaviors/").
export function Portal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}
