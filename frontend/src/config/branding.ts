// AppShell (Epic 2, UX §1.1) extends this with appName/mark/wordmark/favicon. This story
// ships only the appearance defaults the theming engine seeds from — never hardcode the
// default theme/font elsewhere.

import type { ThemeId, FontId } from '../theme/palettes'

interface Branding {
  defaultTheme: ThemeId
  defaultFont: FontId
}

export const branding: Branding = {
  defaultTheme: 'base',
  defaultFont: 'base',
}
