import { type ReactNode, useEffect, useRef, useState } from 'react'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
}

export function Tooltip({ content, children }: TooltipProps) {
  const ref = useRef<HTMLElement>(null)
  // Auto-flip above→below when near the top viewport edge (CLAUDE.md §5.8).
  const [below, setBelow] = useState(false)
  const computePlacement = () => {
    const r = ref.current?.getBoundingClientRect()
    if (r) setBelow(r.top < 56)
  }

  // Escape force-dismiss: blur whatever child is focused (shows-on-focus via group-focus-within).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ref.current?.contains(document.activeElement)) {
        ;(document.activeElement as HTMLElement)?.blur()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // NOTE: the wrapper is NOT focusable (no tabIndex). It would otherwise catch focus as an
  // unrounded inline span and render the global square focus outline around the trigger.
  // The trigger child is the focusable element; group-focus-within shows the tooltip on its focus.
  return (
    <span
      ref={ref}
      className="group/tooltip relative inline-flex"
      onMouseEnter={computePlacement}
      onFocusCapture={computePlacement}
    >
      {children}
      <span
        className={`
          pointer-events-none absolute left-1/2 -translate-x-1/2
          ${below ? 'top-full mt-2' : 'bottom-full mb-2'}
          opacity-0 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100
          transition-opacity duration-quick delay-300
          max-w-tooltip w-max px-2 py-1 rounded text-xs
          bg-surface-overlay border border-border text-text-primary shadow-lg
          z-tooltip
        `}
        role="tooltip"
      >
        {content}
      </span>
    </span>
  )
}
