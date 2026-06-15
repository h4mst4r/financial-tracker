import { useEffect } from 'react'
import { useThemeStore } from '../stores/themeStore'
import type { ThemeId, ResolvedThemeId, FontId } from './palettes'

function resolveTheme(theme: ThemeId): ResolvedThemeId {
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

/** Applies the current theme/font to <html> and keeps them live. Call once, high in the tree. */
export function useAppearance(): void {
  const theme = useThemeStore((s) => s.theme)
  const font = useThemeStore((s) => s.font)

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
}
