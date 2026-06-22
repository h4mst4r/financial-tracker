import { useEffect } from 'react'
import { useThemeStore } from '../stores/themeStore'
import type { ThemeId, ResolvedThemeId, FontId, DensityId } from './palettes'

/** Resolve the stored theme id to a concrete palette — `'base'` follows the OS light/dark setting. */
export function resolveTheme(theme: ThemeId): ResolvedThemeId {
  if (theme !== 'base') return theme
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'base-light' : 'base-dark'
}

function applyTheme(resolved: ResolvedThemeId): void {
  const el = document.documentElement
  // base-dark is the @theme default — clearing the attribute lets it apply.
  if (resolved === 'base-dark') delete el.dataset.theme
  else el.dataset.theme = resolved
}

function applyFont(font: FontId): void {
  const el = document.documentElement
  // base (Inter) is the @theme default.
  if (font === 'base') delete el.dataset.font
  else el.dataset.font = font
}

function applyReduceMotion(reduceMotion: boolean): void {
  const el = document.documentElement
  // Absence = motion on (mirrors how base-dark/base clear their attributes).
  if (reduceMotion) el.dataset.reduceMotion = 'true'
  else delete el.dataset.reduceMotion
}

function applyDensity(density: DensityId): void {
  const el = document.documentElement
  // Absence = comfortable (mirrors theme/font/reduce-motion clear-attribute convention).
  if (density === 'compact') el.dataset.density = 'compact'
  else delete el.dataset.density
}

/** Applies the current theme/font/reduceMotion/density to <html> and keeps them live. Call once, high in the tree. */
export function useAppearance(): void {
  const theme = useThemeStore((s) => s.theme)
  const font = useThemeStore((s) => s.font)
  const reduceMotion = useThemeStore((s) => s.reduceMotion)
  const density = useThemeStore((s) => s.density)

  useEffect(() => {
    applyTheme(resolveTheme(theme))
    if (theme !== 'base') return
    // Only 'base' follows the OS — re-resolve on live light/dark flips.
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = (): void => applyTheme(resolveTheme('base'))
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  useEffect(() => {
    applyFont(font)
  }, [font])

  useEffect(() => {
    applyReduceMotion(reduceMotion)
  }, [reduceMotion])

  useEffect(() => {
    applyDensity(density)
  }, [density])
}
