import { create } from 'zustand'
import { branding } from '../config/branding'
import type { ThemeId, FontId } from '../theme/palettes'

interface ThemeState {
  theme: ThemeId
  font: FontId
  setTheme: (theme: ThemeId) => void
  setFont: (font: FontId) => void
  // The single Epic-2 seam: story 2-9 calls this with the logged-in Person.theme/Person.font
  // after auth/me resolves.
  setAppearance: (theme: ThemeId, font: FontId) => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: branding.defaultTheme,
  font: branding.defaultFont,
  setTheme: (theme) => set({ theme }),
  setFont: (font) => set({ font }),
  setAppearance: (theme, font) => set({ theme, font }),
}))
