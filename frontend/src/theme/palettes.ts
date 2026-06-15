// Theme + font registry. The CSS-variable *values* for each palette live in index.css
// ([data-theme] blocks); this registry holds only the metadata the JS remap needs (the
// immersive flag + tint ramp) plus the id union types the engine and branding config share.

/** The concrete palettes a [data-theme] attribute can carry. */
export type ResolvedThemeId = 'base-light' | 'base-dark' | 'retro' | 'brown' | 'gameboy'

/** `'base'` is the auto light/dark default (resolved via prefers-color-scheme). */
export type ThemeId = 'base' | ResolvedThemeId

/** `base` = Inter, `system` = OS sans stack, `mono` = JetBrains Mono as the UI font. */
export type FontId = 'base' | 'system' | 'mono'

interface PaletteMeta {
  immersive: boolean
  /** Anchor hue — present only when immersive. */
  tint?: string
  /** Ordered light → dark ramp steps — present only when immersive. */
  tintRamp?: string[]
}

export const PALETTES: Record<ResolvedThemeId, PaletteMeta> = {
  'base-dark': { immersive: false },
  'base-light': { immersive: false },
  retro: { immersive: false },
  brown: { immersive: false },
  gameboy: { immersive: true, tint: '#8bac0f', tintRamp: ['#9bbc0f', '#8bac0f', '#306230', '#0f380f'] },
}
