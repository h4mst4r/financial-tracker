import { useThemeStore } from '../stores/themeStore'
import { resolveTheme } from './useAppearance'
import { resolveEntityColour, type ResolvedEntityColour } from './colour'

// The shared entity-colour seam (SCP 2026-06-22 colour-system-contract). Every surface that sets
// `--entity-colour` from a per-instance hex calls this so the colour is themed at render: under an
// immersive palette it ramp-snaps (CSS can't), and the §0.11 contrast floor is enforced. Without it,
// a runtime user-picked colour renders raw and never remaps on Game Boy.
//
// `id` only matters for the multi-entity collision nudge (omitted here — single-surface callers don't
// collide; a shared `takenSlots` set is the chart/legend path, Epic 9). `hex` undefined → undefined
// (the consumer falls back to the :root entity-type default, exactly as before).

export function useEntityColour(hex: string | undefined, id?: string): ResolvedEntityColour | undefined {
  const theme = useThemeStore((s) => s.theme)
  if (!hex) return undefined
  return resolveEntityColour(hex, id ?? hex, resolveTheme(theme))
}
