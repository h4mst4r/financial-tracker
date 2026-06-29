import type { CSSProperties } from 'react'
import { useEntityColour } from './useEntityColour'
import { entityEdge } from './colour'

// The one calm/vivid entity-fill resolution for a rendered surface (EntityCard + CategoryTree parent
// rows). Both consumers MUST go through here so the vivid opt-in (FR-SYS-016) can never render on one
// surface and silently no-op on another (the categories-vivid drift this hook was created to kill).
//
// It composes the colour seam (`useEntityColour` → immersive ramp-snap + §0.11 floor) into the CSS
// variables the `bg-entity-fill-*` / `text-on-entity` / `text-entity-*` utilities read: calm uses the
// remapped colour as-is; vivid uses the floor-enforced fill + its WCAG text pole + the per-surface
// emphasis stops (so muted/faint text stays legible on a saturated fill).

export interface EntityFill {
  style: CSSProperties
  /** `bg-entity-fill-vivid` (saturated) | `bg-entity-fill-calm` (18% tint). */
  fillClass: string
  /** Foreground for the surface's primary text: `text-on-entity` on vivid, else `text-entity-fg`. */
  textClass: string
  /** True on a vivid fill — control glyphs must use the contrast pole, not the raw `--entity-colour`. */
  vivid: boolean
}

export function useEntityFill(colour: string | undefined, vivid: boolean): EntityFill {
  const resolved = useEntityColour(colour)
  // Calm uses the (remapped) colour as-is; vivid uses the floor-enforced fill + its WCAG text pole.
  const entityFill = vivid ? resolved?.vividFill : resolved?.colour
  const onColour = vivid ? resolved?.on : undefined
  const edge = entityEdge({ entityFill, onColour, vivid })
  const style: CSSProperties = {
    ...(entityFill ? { '--entity-colour': entityFill } : {}),
    ...(edge ? { '--entity-edge': edge } : {}),
    ...(onColour ? { '--entity-on-colour': onColour } : {}),
    // Entity-axis emphasis poles (§2 on the entity surface): vivid mutes the on-colour pole toward the
    // fill; calm inherits the :root defaults (the text-entity-fg pole over surface-raised).
    ...(onColour ? { '--entity-fg': 'var(--entity-on-colour)', '--entity-emph-surface': 'var(--entity-colour)' } : {}),
    // VIVID: the §2 emphasis stops FLOORED against this fill (§0a per-surface floor) so muted/faint stay
    // ≥ their target ratio on a saturated fill instead of the neutral-surface fraction dropping under it.
    ...(onColour && resolved
      ? {
          '--entity-text-default': resolved.vividText.default,
          '--entity-text-muted': resolved.vividText.muted,
          '--entity-text-faint': resolved.vividText.faint,
        }
      : {}),
    // On a vivid fill the MiniSparkline switches to the contrast pole (else it'd be drawn in the fill
    // colour and vanish — UX §9.2). Calm leaves it unset → the atom keeps the identity colour.
    ...(onColour ? { '--spark-colour': 'var(--entity-on-colour)' } : {}),
  } as CSSProperties
  return {
    style,
    fillClass: vivid ? 'bg-entity-fill-vivid' : 'bg-entity-fill-calm',
    textClass: onColour ? 'text-on-entity' : 'text-entity-fg',
    vivid: !!onColour,
  }
}
