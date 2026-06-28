import { useCallback, useRef, useState } from 'react'

// useMenu — the headless roving-keyboard behavior for rows-in-a-Popover (UX "Behaviors": Menu owns
// "↑↓ Enter Esc"). It owns ONLY the active-index state machine + the key transitions; the skin decides
// how the active row is reflected (DOM `.focus()` for ContextMenu, `aria-activedescendant` for the
// searchable Dropdown) and seeds the initial index on open. Consumers pre-filter their rows (e.g.
// ContextMenu excludes dividers + disabled entries) and pass the resulting `itemCount`.
//
// `onKeyDown` is a STABLE callback (reads count/handlers via refs) so it can be attached to a document
// listener (ContextMenu) without the listener going stale as the active index changes — the original
// ContextMenu used a focus-index ref for exactly this reason. It accepts either a React synthetic event
// or a DOM KeyboardEvent (both expose `key` + `preventDefault`).

interface KeyLike {
  key: string
  preventDefault: () => void
}

export interface UseMenuOptions {
  /** Number of navigable rows (consumer pre-filters out dividers/disabled). */
  itemCount: number
  /** Activate the row at `index` (Enter / consumer click). */
  onActivate: (index: number) => void
  /** Close the menu (Escape). */
  onClose?: () => void
}

export function useMenu({ itemCount, onActivate, onClose }: UseMenuOptions) {
  const [activeIndex, setActiveIndexState] = useState(-1)
  const activeIndexRef = useRef(-1)
  const itemCountRef = useRef(itemCount)
  itemCountRef.current = itemCount
  const onActivateRef = useRef(onActivate)
  onActivateRef.current = onActivate
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const setActiveIndex = useCallback((i: number) => {
    activeIndexRef.current = i
    setActiveIndexState(i)
  }, [])

  const onKeyDown = useCallback(
    (e: KeyLike) => {
      const cur = activeIndexRef.current
      const n = itemCountRef.current
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex(Math.min(cur + 1, n - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex(Math.max(cur - 1, 0))
      } else if (e.key === 'Enter' && cur >= 0 && cur < n) {
        e.preventDefault()
        onActivateRef.current(cur)
      } else if (e.key === 'Escape') {
        onCloseRef.current?.()
      }
    },
    [setActiveIndex],
  )

  return { activeIndex, setActiveIndex, onKeyDown }
}
