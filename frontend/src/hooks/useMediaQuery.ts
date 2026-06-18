import { useSyncExternalStore } from 'react'

/** Subscribe to a CSS media query (UX §0.10 breakpoints). `max-width` queries default to `false`
 *  (the widest layout) when matchMedia is unavailable (SSR / jsdom tests), so the AppShell renders
 *  its expanded sidebar by default. Mirrors the matchMedia listener pattern in `useAppearance`. */
export function useMediaQuery(query: string): boolean {
  const subscribe = (onChange: () => void) => {
    const mql = window.matchMedia(query)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }
  const getSnapshot = () => window.matchMedia(query).matches
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
