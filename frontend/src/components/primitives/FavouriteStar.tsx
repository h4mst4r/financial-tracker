import { ACTION_ICON } from '../../config/iconRegistry'

// The favourite glyph, via the icon registry (L14). Rendered directly (not through `Icon`) because it
// needs the lucide `fill` prop for the solid/outline distinction.
const StarGlyph = ACTION_ICON.favourite

// FavouriteStar (UX §2.3 / §7 / UX-DR8) — the reusable favourite toggle extracted from the 1.9b inline
// EntityCard star. Controlled & presentational: `favourite` in, `onToggle` out. Outline gold when off,
// solid gold when on — same accent-important colour both ways; only the fill differs (§2.3: the
// favourited/un-favourited distinction is fill, not colour). Colour comes entirely from the §6
// --color-accent-important token (the text-accent-important utility) + currentColor on the glyph — no
// literal hex — so it remaps for free under immersive themes (the theming engine redefines it per palette;
// atom only reads it). The atom IS the <button>; consumers place it in a sibling/z-raised cluster, never
// nested in another <button> (§2.6). The onClick stops propagation so a toggle never triggers an ancestor's
// open handler.

export interface FavouriteStarProps {
  /** Controlled state: true → solid gold star; false → outline gold star (same colour, only fill differs). */
  favourite: boolean
  /** Fired on click / Enter / Space. */
  onToggle: () => void
  /** lucide Star size. Default 16 (the 1.9b card size). */
  size?: number
  className?: string
  /** Overrides the default `favourite ? 'Unfavourite' : 'Favourite'` accessible label. */
  'aria-label'?: string
  /** Pass-through so consumers (e.g. EntityCard) can keep a stable testid. */
  'data-testid'?: string
}

export function FavouriteStar({
  favourite,
  onToggle,
  size = 16,
  className = '',
  'aria-label': ariaLabel,
  'data-testid': dataTestid,
}: FavouriteStarProps) {
  return (
    <button
      type="button"
      data-testid={dataTestid}
      aria-pressed={favourite}
      aria-label={ariaLabel ?? (favourite ? 'Unfavourite' : 'Favourite')}
      onClick={(e) => {
        // load-bearing: a star toggle must never bubble to an ancestor open/click handler (§2.6).
        e.stopPropagation()
        onToggle()
      }}
      className={`text-accent-important flex items-center transition-transform duration-quick hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-glow-primary ${className}`}
    >
      <StarGlyph size={size} fill={favourite ? 'currentColor' : 'none'} aria-hidden />
    </button>
  )
}
