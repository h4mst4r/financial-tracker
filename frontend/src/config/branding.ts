// Single branding source (FR-SYS-011). Every wordmark/mark render reads from here — never an inline
// literal in a page (P4). Story 2.4b adds `wordmark` (the first consumer is the Login page, UX §4.1);
// Story 2.10 promotes these values to the config-backed `branding` endpoint without changing call
// sites. The theming engine (Story 1.6) seeds appearance defaults from here too — never hardcode the
// default theme/font/wordmark elsewhere.

import type { ThemeId, FontId } from '../theme/palettes'

interface Branding {
  defaultTheme: ThemeId
  defaultFont: FontId
  wordmark: string
}

export const branding: Branding = {
  defaultTheme: 'base',
  defaultFont: 'base',
  wordmark: 'Financial Tracker',
}
