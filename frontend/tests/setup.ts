import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom has no matchMedia; useAppearance + the entity-colour resolver read prefers-color-scheme.
// Default: not light (→ base-dark). A PLAIN function (not vi.fn) so a test's `vi.restoreAllMocks()`
// can't strip the implementation and leave `matchMedia()` returning undefined (the entity-colour
// resolver now calls it on every EntityCard render).
window.matchMedia = (query: string): MediaQueryList =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList

afterEach(() => {
  cleanup()
})
