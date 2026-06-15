import { create } from 'zustand'
import { branding } from '../config/branding'
import type { ThemeId, FontId } from '../theme/palettes'

interface ThemeState {
  theme: ThemeId
  font: FontId
  reduceMotion: boolean
  setTheme: (theme: ThemeId) => void
  setFont: (font: FontId) => void
  setReduceMotion: (reduceMotion: boolean) => void
  // The single Epic-2 seam: story 2-9 calls this with the logged-in Person.theme/Person.font/Person.reduce_motion
  // after auth/me resolves.
  setAppearance: (theme: ThemeId, font: FontId, reduceMotion?: boolean) => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: branding.defaultTheme,
  font: branding.defaultFont,
  reduceMotion: false,
  setTheme: (theme) => set({ theme }),
  setFont: (font) => set({ font }),
  setReduceMotion: (reduceMotion) => set({ reduceMotion }),
  setAppearance: (theme, font, reduceMotion = false) => set({ theme, font, reduceMotion }),
}))
