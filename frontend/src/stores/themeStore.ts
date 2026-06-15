import { create } from 'zustand'
import { branding } from '../config/branding'
import type { ThemeId, FontId, DensityId } from '../theme/palettes'

interface ThemeState {
  theme: ThemeId
  font: FontId
  reduceMotion: boolean
  density: DensityId
  setTheme: (theme: ThemeId) => void
  setFont: (font: FontId) => void
  setReduceMotion: (reduceMotion: boolean) => void
  setDensity: (density: DensityId) => void
  // The single Epic-2 seam: story 2-9 calls this with the logged-in Person.theme/Person.font/Person.reduce_motion/Person.density
  // after auth/me resolves.
  setAppearance: (theme: ThemeId, font: FontId, reduceMotion?: boolean, density?: DensityId) => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: branding.defaultTheme,
  font: branding.defaultFont,
  reduceMotion: false,
  density: 'comfortable',
  setTheme: (theme) => set({ theme }),
  setFont: (font) => set({ font }),
  setReduceMotion: (reduceMotion) => set({ reduceMotion }),
  setDensity: (density) => set({ density }),
  setAppearance: (theme, font, reduceMotion = false, density = 'comfortable') => set({ theme, font, reduceMotion, density }),
}))
