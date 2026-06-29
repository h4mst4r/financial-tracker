import type { ReactNode } from 'react'
import { ACTION_ICON } from '../../config/iconRegistry'
import { ContextMenu } from '../primitives/ContextMenu'
import type { ContextMenuEntry } from '../primitives/ContextMenu'
import { Badge } from '../primitives/Badge'
import { Icon } from '../primitives/Icon'
import { FavouriteStar } from '../primitives/FavouriteStar'
import { useEntityFill } from '../../theme/useEntityFill'

// The generic entity card (UX §2, FR-SYS-016) — colour-fill identity (calm/vivid via --entity-colour),
// header (icon chip · name · favourite star · ⋮), hero/sparkline/footer slots, and the
// favourited / archived / selected states. Controlled & decoupled from data (like EntityPage): props in,
// callbacks out. The consuming page wires useEntityManager → EntityCard. MiniSparkline (1.10) fills the
// `sparkline` slot; selection LOGIC (useMultiSelect) is 1.9c — `selected` here is presentational only.

export interface EntityCardProps {
  /** The instance colour (drives --entity-colour). Omitted → the :root entity-type default applies. */
  colour?: string
  /** Full-saturation fill + contrast-aware text. Default: calm (soft 14% tint, text-text-strong). */
  vivid?: boolean
  /** Colour icon chip glyph — an emoji string or a lucide <Icon>. */
  icon?: ReactNode
  name: ReactNode
  /** Primary value, large (balance / current value). */
  hero?: ReactNode
  /** Secondary line under the hero (e.g. credit card "due · limit"). */
  subtitle?: ReactNode
  /** Value-history sparkline slot — MiniSparkline lands in story 1.10. */
  sparkline?: ReactNode
  /** Footer meta (e.g. "type · currency"). */
  meta?: ReactNode
  /** Stacked owner avatars (multi-owner accounts). */
  owners?: ReactNode
  favourite?: boolean
  onToggleFavourite?: () => void
  /** ⋮ context-menu entries (UX §8.1) — passed straight to the ContextMenu primitive. Omit → no ⋮. */
  menuItems?: ContextMenuEntry[]
  archived?: boolean
  /** Presentational selection treatment only (offset ring + check + lift); multi-select is 1.9c. */
  selected?: boolean
  /** Tap-to-open the detail view (§8.2b). */
  onClick?: () => void
}

export function EntityCard({
  colour,
  vivid = false,
  icon,
  name,
  hero,
  subtitle,
  sparkline,
  meta,
  owners,
  favourite = false,
  onToggleFavourite,
  menuItems,
  archived = false,
  selected = false,
  onClick,
}: EntityCardProps) {
  // §2.5: the per-instance colour is an inline CSS variable (data, not a design-token literal); the fill
  // utilities read it. The shared `useEntityFill` seam themes the runtime hex (immersive ramp-snap +
  // §0.11 floor) and maps calm/vivid into the fill/text utilities — the SAME seam the CategoryTree rows
  // use, so the vivid opt-in can't render here and silently no-op there.
  const { style, fillClass, textClass } = useEntityFill(colour, vivid)
  // The ⋮ trigger follows the card's entity foreground (the §2 entity-axis emphasis, NOT opacity — which
  // would render light-on-light on a light vivid fill, the old cyan→white-dots bug): muted at rest,
  // strong on hover, in both modes (the panel sets the poles; calm uses the :root defaults).
  const controlClass = 'text-entity-muted hover:text-entity-strong'
  // Default border is a tint of the instance colour (design bible .ecard: color-mix(--ec 30%, --border)),
  // so the card edge carries the entity identity — NOT a flat neutral border. Archived → dashed neutral;
  // selected → transparent (the §2.4 offset ring is the edge instead).
  const borderClass = archived
    ? 'border-dashed border-border-strong'
    : selected
      ? 'border-transparent'
      : 'border-entity-edge'

  return (
    <div
      data-testid="entity-card"
      data-vivid={vivid || undefined}
      data-selected={selected || undefined}
      data-archived={archived || undefined}
      style={style}
      className={`
        relative flex min-h-entity-card flex-col gap-xs rounded-lg border p-md
        transition-transform duration-quick
        ${fillClass} ${textClass} ${borderClass}
        ${archived ? 'archived' : ''}
        ${selected ? 'ring-2 ring-offset-2 ring-offset-surface ring-accent -translate-y-px shadow-md' : ''}
        ${onClick && !archived ? 'hover:-translate-y-px hover:shadow-md' : ''}
      `}
    >
      {/* Stretched open button (§2.6: no <button> nested in <button>). Body clicks hit this; the star
          and ⋮ sit above it (z-raised) with their own handlers. */}
      {onClick && (
        <button
          type="button"
          data-testid="entity-card-open"
          aria-label={typeof name === 'string' ? `Open ${name}` : 'Open'}
          onClick={onClick}
          className="absolute inset-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-glow-primary"
        />
      )}

      {/* Selected corner check badge (§2.4). */}
      {selected && (
        <span
          data-testid="entity-card-check"
          className="bg-primary text-on-primary z-raised absolute -left-xs -top-xs flex h-5 w-5 items-center justify-center rounded-full"
        >
          <Icon icon={ACTION_ICON.select} size={12} />
        </span>
      )}

      {/* Header: icon chip · name (· Archived badge) · [controls floated top-right]. */}
      <div className="flex items-start gap-sm pr-xl">
        {icon != null && (
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-lg ${
              vivid ? 'bg-entity-chip' : 'bg-entity-chip-calm text-entity'
            }`}
          >
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{name}</div>
          {archived && (
            <Badge className="mt-xs" variant="neutral">
              Archived
            </Badge>
          )}
        </div>
      </div>

      {/* Controls cluster — above the overlay (z-raised) so they stay clickable. */}
      <div className="z-raised absolute right-sm top-sm flex items-center gap-xs">
        {onToggleFavourite && (
          <FavouriteStar
            data-testid="entity-card-favourite"
            favourite={favourite}
            onToggle={onToggleFavourite}
          />
        )}
        {menuItems && menuItems.length > 0 && (
          <ContextMenu
            trigger={
              <span className={`flex items-center ${controlClass}`} aria-label="Actions">
                <Icon icon={ACTION_ICON.more} size={16} />
              </span>
            }
            items={menuItems}
          />
        )}
      </div>

      {/* Hero figure — SANS face, large (§0.3: standalone card hero figures use the sans face, not the
          columnar monetary mono) + optional subtitle. */}
      {hero != null && <div className="text-2xl font-semibold">{hero}</div>}
      {subtitle != null && <div className="text-sm text-entity-default">{subtitle}</div>}

      {/* Value-history sparkline slot (MiniSparkline → 1.10). */}
      {sparkline != null && <div className="mt-auto">{sparkline}</div>}

      {/* Footer meta · owner avatars. */}
      {(meta != null || owners != null) && (
        <div className="mt-auto flex items-center justify-between gap-sm text-sm text-entity-default">
          <span className="truncate">{meta}</span>
          {owners != null && <span className="flex shrink-0 items-center">{owners}</span>}
        </div>
      )}
    </div>
  )
}
