import { useEffect, useState, type RefObject } from 'react'

// useAnchoredPosition — the position half of the §Behaviors `Popover` (anchor · position). A panel
// portalled out of its trigger's DOM subtree (to escape an `overflow:hidden` modal / a clipping ancestor)
// is `position:fixed` and must be placed against the trigger's viewport rect, kept attached on
// scroll/resize, and flipped above when it would overflow the bottom. Extracted from the FilterBar
// AnchoredPanel reposition logic so every field picker shares ONE anchoring implementation (L0).
//
// Returns viewport coords + the trigger width (so a full-width control's panel — Dropdown — can match its
// trigger; intrinsic-width panels ignore it). `x/y` start offscreen until measured (no first-frame flash).

export interface AnchoredPosition {
  x: number
  y: number
  /** The trigger's width — for panels that match the control width (Dropdown). */
  width: number
}

const OFFSCREEN: AnchoredPosition = { x: -9999, y: -9999, width: 0 }

export function useAnchoredPosition(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
): AnchoredPosition {
  const [pos, setPos] = useState<AnchoredPosition>(OFFSCREEN)

  useEffect(() => {
    if (!open) {
      setPos(OFFSCREEN)
      return
    }
    const reposition = () => {
      const t = triggerRef.current?.getBoundingClientRect()
      const p = panelRef.current?.getBoundingClientRect()
      if (!t || !p) return
      const margin = 8
      const gap = 4
      const x = Math.max(margin, Math.min(t.left, window.innerWidth - p.width - margin))
      let y = t.bottom + gap
      // Flip above when the panel would overflow the viewport bottom.
      if (y + p.height > window.innerHeight - margin) y = Math.max(margin, t.top - p.height - gap)
      setPos({ x, y, width: t.width })
    }
    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, triggerRef, panelRef])

  return pos
}
