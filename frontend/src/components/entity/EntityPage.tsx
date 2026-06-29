import { type ReactNode, useId } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ACTION_ICON, errorIcon } from '../../config/iconRegistry'
import { ERROR_STATE } from '../../config/emptyStateRegistry'
import { Button } from '../primitives/Button'
import { Input } from '../primitives/Input'
import { SegmentedControl } from '../primitives/SegmentedControl'
import { Toggle } from '../primitives/Toggle'
import { Skeleton } from '../primitives/Skeleton'
import { EmptyState } from '../primitives/EmptyState'
import { Icon } from '../primitives/Icon'

// The standardized scaffold every entity module renders through (UX §1.2/§1.3, ARCH §6.4):
// toolbar (title + info + controls + filter slot + New) over a content area that renders the four
// data states (loading / error / empty / populated). A controlled component — it owns NO data; the
// page wires useEntityManager → these props. EntityCard fills the content slot in story 1.9b.

export type EntityView = 'grid' | 'list'

export interface EntityPageProps {
  title: string
  info?: ReactNode
  newLabel: string
  onNew: () => void

  search: string
  onSearchChange: (value: string) => void
  view: EntityView
  onViewChange: (view: EntityView) => void
  showArchived: boolean
  onShowArchivedChange: (value: boolean) => void
  onSort?: () => void
  /** Hide the grid/list view toggle — for surfaces with a single fixed layout (e.g. CategoryTree). */
  hideViewToggle?: boolean
  /** Hide the Sort button — for surfaces that don't support manual sort (e.g. CategoryTree). */
  hideSort?: boolean
  /** Hide the Archived toggle — for surfaces with no archive lifecycle (e.g. Currencies). */
  hideArchived?: boolean
  /** Entity-specific filter controls (e.g. Accounts → bank/credit-card type). */
  filters?: ReactNode

  isLoading: boolean
  isError: boolean
  onRetry: () => void
  isEmpty: boolean
  emptyIcon?: LucideIcon
  emptyTitle: string
  emptyDescription?: ReactNode
  /** Override the empty-state action(s). Defaults to a single "+ New" button. */
  emptyAction?: ReactNode

  children: ReactNode
}

const viewOptions = [
  { value: 'grid', label: 'Grid' },
  { value: 'list', label: 'List' },
]

export function EntityPage(props: EntityPageProps) {
  const {
    title,
    info,
    newLabel,
    onNew,
    search,
    onSearchChange,
    view,
    onViewChange,
    showArchived,
    onShowArchivedChange,
    onSort,
    hideViewToggle,
    hideSort,
    hideArchived,
    filters,
  } = props
  const archivedToggleId = useId()

  return (
    <div className="flex flex-col gap-md">
      {/* Toolbar — UX §1.2 order: left title+info · right cluster of controls + filters + New. */}
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div>
          <h3 className="text-lg font-semibold text-text-strong">{title}</h3>
          {info && <div className="text-sm text-text-default">{info}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-sm">
          <div className="relative">
            <span className="absolute left-sm top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
              <Icon icon={ACTION_ICON.search} size={16} />
            </span>
            <Input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={`Search ${title.toLowerCase()}`}
              aria-label={`Search ${title.toLowerCase()}`}
              className="pl-xl max-w-input"
            />
          </div>
          {!hideSort && (
            <Button variant="ghost" onClick={onSort} aria-label="Sort">
              <span className="inline-flex items-center gap-xs">
                <Icon icon={ACTION_ICON.sort} size={16} /> Sort
              </span>
            </Button>
          )}
          {!hideViewToggle && (
            <SegmentedControl
              value={view}
              options={viewOptions}
              onChange={(v) => onViewChange(v as EntityView)}
            />
          )}
          {!hideArchived && (
            <label
              htmlFor={archivedToggleId}
              className="inline-flex items-center gap-xs text-sm text-text-default"
            >
              <Toggle
                id={archivedToggleId}
                checked={showArchived}
                onChange={onShowArchivedChange}
              />
              Archived
            </label>
          )}
          {filters}
          <Button onClick={onNew} data-testid="entity-page-new">
            + New {newLabel}
          </Button>
        </div>
      </div>

      {/* Content area — four data states (UX §18 / Bible #states). */}
      <EntityPageContent {...props} />
    </div>
  )
}

function EntityPageContent({
  newLabel,
  onNew,
  view,
  isLoading,
  isError,
  onRetry,
  isEmpty,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  emptyAction,
  children,
}: EntityPageProps) {
  if (isLoading) {
    return (
      <div data-testid="entity-page-loading" className="grid-cols-entity grid gap-md">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} variant="rect" className="h-entity-card" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-empty-state flex flex-col items-center justify-center gap-sm py-xl text-center">
        <span className="bg-error-fill text-error flex items-center justify-center rounded-full p-md">
          <Icon icon={errorIcon} size={28} />
        </span>
        <h3 className="text-lg font-medium text-text-default">{ERROR_STATE.title}</h3>
        <p className="text-sm text-text-muted">{ERROR_STATE.description}</p>
        <Button variant="secondary" onClick={onRetry} className="mt-sm">
          Retry
        </Button>
      </div>
    )
  }

  if (isEmpty) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction ?? <Button onClick={onNew}>+ New {newLabel}</Button>}
      />
    )
  }

  if (view === 'list') {
    return <div className="flex flex-col gap-density">{children}</div>
  }

  return (
    <div className="grid-cols-entity grid gap-md">
      {children}
      {/* Second equal entry point — the grid ends in a ghost "+ New" tile (UX §1.3). Ghost-fill
          treatment (solid border + transparent bg + hover surface fill) — NOT dashed; dashed is reserved
          for the Zone primitive + the archived treatment (it's an interactable, not a Zone). */}
      <button
        type="button"
        data-testid="entity-page-ghost-tile"
        onClick={onNew}
        className="
          flex min-h-entity-card flex-col items-center justify-center gap-xs rounded-lg
          border border-border bg-transparent text-text-muted
          transition-colors duration-quick
          hover:border-border-light hover:bg-surface-hover hover:text-text-default
        "
      >
        <Icon icon={ACTION_ICON.add} size={20} />
        <span className="text-sm font-medium">New {newLabel}</span>
      </button>
    </div>
  )
}
