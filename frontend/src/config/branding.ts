// Single branding source (FR-SYS-011, UX §1.1). Every brand string/asset reads from here — never an
// inline literal in a page/shell/document title (P4). Story 2.4b added `wordmark` (first consumer:
// Login, UX §4.1); Story 2.10 completed the UX §1.1 shape — `appName` (drives the document title +
// the dashboard heading) plus the optional white-label provisions `mark`/`favicon`. The theming
// engine (Story 1.6) seeds appearance defaults from here too — never hardcode the default
// theme/font/wordmark elsewhere. Server-driven / per-tenant config is post-MVP.
//
// `mark` and `favicon` are intentionally undefined in MVP (no designed asset ships): BrandMark falls
// back to its palette-reactive gradient, and main.tsx injects no <link rel="icon"> until set.

import type { ThemeId, FontId } from '../theme/palettes'

interface Branding {
  defaultTheme: ThemeId
  defaultFont: FontId
  appName: string
  wordmark: string
  /** White-label provision — image src for the logo mark. Undefined → BrandMark gradient placeholder. */
  mark?: string
  /** White-label provision — favicon href. Undefined → no <link rel="icon"> injected. */
  favicon?: string
}

export const branding: Branding = {
  defaultTheme: 'base',
  defaultFont: 'base',
  appName: 'Financial Tracker',
  wordmark: 'Financial Tracker',
}
