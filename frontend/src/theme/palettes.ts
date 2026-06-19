// Theme + font registry. The CSS-variable *values* for each palette live in index.css
// ([data-theme] blocks); this registry holds only the metadata the JS remap needs (the
// immersive flag + tint ramp) plus the id union types the engine and branding config share.

/** The concrete palettes a [data-theme] attribute can carry. */
export type ResolvedThemeId = 'base-light' | 'base-dark' | 'retro' | 'brown' | 'gameboy'

/** `'base'` is the auto light/dark default (resolved via prefers-color-scheme). */
export type ThemeId = 'base' | ResolvedThemeId

/** `base` = Inter, `system` = OS sans stack, `mono` = JetBrains Mono as the UI font. */
export type FontId = 'base' | 'system' | 'mono'

/** Per-person density preference — comfortable is the default, compact tightens controls. */
export type DensityId = 'comfortable' | 'compact'

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

/** A user-selectable theme for the Profile → Appearance ThemePicker (Story 2.9, UX §5.1). `base` is
 *  the auto light/dark default; the rest are explicit palettes. `swatch` is the palette's
 *  `--color-accent-primary` (index.css) — kept here in the registry (the sanctioned home for palette
 *  hex, alongside `tint`/`tintRamp`) so the picker reads a named value, never a raw hex in TSX (P4). */
export interface ThemeOption {
  value: ThemeId
  label: string
  swatch: string
}

export const THEME_OPTIONS: ThemeOption[] = [
  { value: 'base', label: 'Base (auto)', swatch: '#6366f1' },
  { value: 'base-light', label: 'Base Light', swatch: '#4f46e5' },
  { value: 'retro', label: 'Retro 70s', swatch: '#d2691e' },
  { value: 'brown', label: 'Muted Brown', swatch: '#b08968' },
  { value: 'gameboy', label: 'Game Boy', swatch: '#8bac0f' },
]

/** Font options for the Profile → Appearance font Dropdown (Story 2.9, UX §5.1). */
export const FONT_OPTIONS: { value: FontId; label: string }[] = [
  { value: 'base', label: 'Inter' },
  { value: 'system', label: 'System' },
  { value: 'mono', label: 'JetBrains Mono' },
]
