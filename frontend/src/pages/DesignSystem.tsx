import { useState, type CSSProperties } from 'react'
import {
  Home,
  Settings,
  MoreVertical,
  Edit,
  Trash2,
  Copy,
  Archive,
  SearchX,
  Wallet,
  Star,
  LineChart,
  Mail,
  Lock,
  Wrench,
} from 'lucide-react'
import {
  Button,
  Input,
  Label,
  Checkbox,
  Toggle,
  Dropdown,
  ThemePicker,
  SegmentedControl,
  Icon,
  Badge,
  Avatar,
  Card,
  Divider,
  Spinner,
  Skeleton,
  ProgressBar,
  MiniSparkline,
  FavouriteStar,
  Tooltip,
  ContextMenu,
  Modal,
  EmptyState,
  ConfirmationDialog,
} from '../components/primitives'
import { PublicPage } from '../components/PublicPage'
import { AppShell } from '../components/shell/AppShell'
import { EntityPage, EntityCard, EntityModal, BulkActionBar } from '../components/entity'
import type { BulkAction } from '../components/entity'
import { useMultiSelect } from '../hooks/useMultiSelect'
import { useAlertStore } from '../stores/alertStore'
import { useThemeStore } from '../stores/themeStore'
import type { DensityId } from '../theme/palettes'
import {
  DESIGN_SYSTEM_GROUPS,
  DESIGN_SYSTEM_SECTIONS,
} from './designSystemSections'

const densityOptions = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
]

const dropdownOptions = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
  { value: 'c', label: 'Option C' },
]

const segmentedOptions = [
  { value: 'all', label: 'All' },
  { value: 'mine', label: 'Mine' },
]

// Section order + grouping mirror the rendered design bible (design-bible/index.html) so the two
// pages stay structurally diff-able: Foundation → Primitives → Form controls → Pickers →
// Feedback & overlay → States. As more of the app is built, new component sections must be added
// in their bible position (not appended) — the end goal is a 1:1 structural duplicate of the bible.
function GroupHeading({ children }: { children: string }) {
  return (
    <h2 className="text-2xs font-medium uppercase tracking-wide text-text-muted mt-lg mb-md border-b border-border pb-xs">
      {children}
    </h2>
  )
}

// Section index — mirrors the design bible's grouped left nav (#library). Rendered from the shared
// DESIGN_SYSTEM_SECTIONS registry so it can never drift from the demo sections (P1 guard test).
// Full-width above the content on small viewports (stacks, never overflows); a sticky sidebar at lg+.
function SectionNav() {
  return (
    <nav
      aria-label="Design system sections"
      className="shrink-0 lg:w-52 lg:sticky lg:top-lg lg:self-start lg:max-h-screen lg:overflow-y-auto"
    >
      {DESIGN_SYSTEM_GROUPS.map((group) => (
        <div key={group} className="mb-md">
          <div className="text-2xs font-medium uppercase tracking-wide text-text-muted mb-xs">{group}</div>
          <ul className="flex flex-wrap gap-x-md gap-y-2xs lg:flex-col lg:gap-0">
            {DESIGN_SYSTEM_SECTIONS.filter((s) => s.group === group).map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="block py-2xs text-sm text-text-secondary hover:text-text-primary transition-colors duration-quick"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export function DesignSystem() {
  const [buttonClicks, setButtonClicks] = useState(0)
  const [inputValue, setInputValue] = useState('')
  const [checkboxChecked, setCheckboxChecked] = useState(false)
  const [toggleChecked, setToggleChecked] = useState(false)
  const [dropdownValue, setDropdownValue] = useState('a')
  const [segmentedValue, setSegmentedValue] = useState('all')

  // Overlay state
  const [modalOpen, setModalOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // EntityPage demo harness (composite scaffold; content tiles are placeholders — EntityCard is 1.9b).
  const [epView, setEpView] = useState<'grid' | 'list'>('grid')
  const [epSearch, setEpSearch] = useState('')
  const [epArchived, setEpArchived] = useState(false)
  const [epState, setEpState] = useState('populated')
  const epStateOptions = [
    { value: 'populated', label: 'Populated' },
    { value: 'empty', label: 'Empty' },
    { value: 'loading', label: 'Loading' },
    { value: 'error', label: 'Error' },
  ]

  // EntityCard / EntityModal demo state (story 1.9b).
  const [cardFav, setCardFav] = useState(true)
  const [cardSelected, setCardSelected] = useState(true)
  const [favOff, setFavOff] = useState(false)
  const [favOn, setFavOn] = useState(true)
  const [entityModalOpen, setEntityModalOpen] = useState(false)

  // BulkActionBar / useMultiSelect demo (story 1.9c). Selection mode flips card onClick from
  // open → toggle-select (mirrors §0.8 long-press-to-enter-multi-select); the bar appears at ≥1.
  const bulkSelect = useMultiSelect()
  const [selectionMode, setSelectionMode] = useState(true)
  const bulkCards = [
    { id: 'bk1', colour: '#6366f1', icon: '🏦', name: 'DBS Multiplier', hero: 'S$ 12,840', meta: 'bank · SGD' },
    { id: 'bk2', colour: '#22c55e', icon: '📈', name: 'VWRA Holdings', hero: 'S$ 48,200', meta: 'capital · SGD' },
    { id: 'bk3', colour: '#ef4444', icon: '💳', name: 'Amex Platinum', hero: 'Debt S$ 3,180', meta: 'credit · SGD' },
  ]
  const bulkActions: BulkAction[] = [
    { id: 'edit', label: 'Edit fields', icon: Edit, onClick: () => {} },
    { id: 'duplicate', label: 'Duplicate', icon: Copy, onClick: () => {} },
    { id: 'visualize', label: 'Visualize', icon: LineChart, tone: 'accent', onClick: () => {} },
    { id: 'delete', label: 'Delete', icon: Trash2, destructive: true, disabled: true, disabledReason: 'Only the owner can delete', onClick: () => {} },
    { id: 'archive', label: 'Archive', icon: Archive, destructive: true, onClick: () => bulkSelect.clear() },
  ]

  const pushToast = useAlertStore((s) => s.pushToast)

  // Density harness: bound to the global theme store (not local state) — useAppearance writes it to
  // <html data-density>, which drives the --density-* CSS vars, so every section re-renders live.
  // This is the dev harness built from SegmentedControl; the Phase-3 DensityToggle composite (UX §7,
  // Settings) is a separate later story and intentionally NOT built here.
  const density = useThemeStore((s) => s.density)
  const setDensity = useThemeStore((s) => s.setDensity)
  const themeId = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)

  const contextMenuItems = [
    { label: 'Edit', icon: Edit, onClick: () => {} },
    { label: 'Duplicate', icon: Copy, onClick: () => {} },
    { label: 'Archive', icon: Archive, onClick: () => {} },
    { divider: true } as const,
    { label: 'Delete', icon: Trash2, onClick: () => {}, destructive: true },
  ]

  // EntityCard ⋮ — the §8.1 standard set with the favourite/open tones.
  const entityCardMenu = [
    { label: 'Edit', icon: Edit, onClick: () => {} },
    { label: 'Duplicate', icon: Copy, onClick: () => {} },
    { label: 'Favourite', icon: Star, onClick: () => {}, tone: 'favourite' as const },
    { label: 'Open', icon: LineChart, onClick: () => {}, tone: 'open' as const },
    { divider: true } as const,
    { label: 'Archive', icon: Archive, onClick: () => {} },
    { label: 'Delete', icon: Trash2, onClick: () => {}, destructive: true },
  ]

  const contextMenuItemsWithDisabled = [
    { label: 'Edit', icon: Edit, onClick: () => {} },
    { label: 'Duplicate', icon: Copy, onClick: () => {}, disabled: true, disabledReason: 'Already at max count' },
    { divider: true } as const,
    { label: 'Delete', icon: Trash2, onClick: () => {}, destructive: true },
  ]

  return (
    <main className="min-h-screen bg-bg text-text-primary p-lg">
      <div className="mx-auto flex max-w-5xl flex-col gap-lg lg:flex-row">
        <SectionNav />
        <div className="min-w-0 flex-1 lg:max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-md mb-lg">
          <h1 className="text-2xl font-medium">Design System</h1>
          <div className="flex items-center gap-sm">
            <span className="text-sm text-text-secondary">Density</span>
            <SegmentedControl
              value={density}
              options={densityOptions}
              onChange={(v) => setDensity(v as DensityId)}
            />
          </div>
        </div>

        {/* ─────────────────────────── Composites (bible #shell) ─────────────────────────── */}
        <GroupHeading>Composites</GroupHeading>

        {/* AppShell — the persistent authenticated chrome (Sidebar + Topbar). Reserved slots for
            view-context (Epic 9), search + alerts (Epic 10). Clipped to a preview box so the
            full-height shell doesn't take over the page. Bible #shell. */}
        <section id="app-shell" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">AppShell</h2>
          <p className="text-sm text-text-secondary mb-md">
            Sidebar (grouped nav · bottom Settings) · Topbar avatar menu (profile + sign out).
            View-context (Epic 9), search &amp; alerts (Epic 10) are reserved slots.
          </p>
          <div className="h-appshell-demo overflow-hidden rounded-lg border border-border">
            <AppShell>
              <div className="p-md text-text-secondary">Routed page content renders here.</div>
            </AppShell>
          </div>
        </section>

        {/* EntityPage — the standardized scaffold (toolbar + filter slot + content slot + states).
            Content tiles are placeholders; EntityCard fills the slot in story 1.9b. */}
        <section id="entity-page" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">EntityPage</h2>
          <div className="flex items-center gap-sm mb-md">
            <span className="text-sm text-text-secondary">State</span>
            <SegmentedControl value={epState} options={epStateOptions} onChange={setEpState} />
          </div>
          <div className="rounded-lg border border-border bg-surface p-md">
            <EntityPage
              title="Accounts"
              info="5 accounts · S$ 22,370 net"
              newLabel="account"
              onNew={() => pushToast({ variant: 'info', message: 'New account (demo)' })}
              search={epSearch}
              onSearchChange={setEpSearch}
              view={epView}
              onViewChange={setEpView}
              showArchived={epArchived}
              onShowArchivedChange={setEpArchived}
              onSort={() => {}}
              isLoading={epState === 'loading'}
              isError={epState === 'error'}
              onRetry={() => setEpState('populated')}
              isEmpty={epState === 'empty'}
              emptyIcon={Wallet}
              emptyTitle="No accounts yet"
              emptyDescription="Add your first account to start tracking balances."
            >
              {['DBS Multiplier', 'VWRA Holdings', 'Amex Platinum', 'Condo'].map((name) => (
                <div
                  key={name}
                  className="flex min-h-entity-card flex-col justify-between rounded-lg border border-border bg-surface-raised p-md"
                >
                  <span className="text-sm font-medium text-text-primary">{name}</span>
                  <span className="monetary-value text-base text-text-secondary">S$ 12,840</span>
                </div>
              ))}
            </EntityPage>
          </div>
        </section>

        {/* EntityCard — colour-fill identity (calm/vivid), favourite star, ⋮, archived/selected states,
            sparkline slot. Variants come from what the consumer passes (no entity-type enum). Bible #entitycard. */}
        <section id="entity-card" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">EntityCard</h2>
          {/* bg-surface backdrop — entity cards live on the bg-surface content area (UX §1.1); it makes the
              selected card's ring-offset read against the real backdrop, not the page bg. */}
          <div className="grid-cols-entity grid gap-md rounded-lg border border-border bg-surface p-md">
            <EntityCard
              colour="#6366f1"
              icon="🏦"
              name="Calm (DBS)"
              hero="S$ 12,840"
              meta="bank · SGD"
              sparkline={<MiniSparkline data={[30, 28, 30, 22, 18, 14, 12, 9]} />}
              favourite={cardFav}
              onToggleFavourite={() => setCardFav((v) => !v)}
              menuItems={entityCardMenu}
              onClick={() => pushToast({ variant: 'info', message: 'Open card (demo)' })}
            />
            <EntityCard
              colour="#6366f1"
              vivid
              icon="🏦"
              name="Vivid (dark fill → light text)"
              hero="S$ 12,840"
              meta="bank · SGD"
              menuItems={entityCardMenu}
              onClick={() => {}}
            />
            <EntityCard
              colour="#9bbc0f"
              vivid
              icon="🏠"
              name="Vivid (light fill → dark text)"
              hero="S$ 1.45M"
              meta="asset · SGD"
              onClick={() => {}}
            />
            <EntityCard
              colour="#22c55e"
              icon="📈"
              name="Selected (tap to toggle)"
              hero="S$ 48,200"
              meta="capital · SGD"
              selected={cardSelected}
              onClick={() => setCardSelected((v) => !v)}
            />
            <EntityCard
              colour="#ef4444"
              icon="💳"
              name="Credit card"
              hero={<span className="text-error">Debt S$ 3,180</span>}
              subtitle="due 28 Jun · limit 20k"
              meta="credit · SGD"
              menuItems={entityCardMenu}
              onClick={() => {}}
            />
            <EntityCard colour="#6366f1" icon="🏦" name="Archived" hero="S$ 0" meta="bank · SGD" archived />
          </div>
        </section>

        {/* EntityModal — the generic two-column create/edit shell over the Modal primitive, Cancel-left /
            Save-right (§4.2). Fields are placeholders; the §8.2 pickers arrive in later epics. Bible #composites. */}
        <section id="entity-modal" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">EntityModal</h2>
          <Button onClick={() => setEntityModalOpen(true)}>Open EntityModal</Button>
          <EntityModal
            open={entityModalOpen}
            onClose={() => setEntityModalOpen(false)}
            title="Edit account"
            onSave={() => setEntityModalOpen(false)}
          >
            <div className="flex flex-col gap-2xs">
              <Label htmlFor="em-name">Name</Label>
              <Input id="em-name" defaultValue="DBS Multiplier" />
            </div>
            <div className="flex flex-col gap-2xs">
              <Label htmlFor="em-type">Type</Label>
              <Input id="em-type" defaultValue="Bank" />
            </div>
            <div className="flex flex-col gap-2xs md:col-span-2">
              <Label htmlFor="em-notes">Notes</Label>
              <Input id="em-notes" placeholder="Optional notes" />
            </div>
          </EntityModal>
        </section>

        {/* BulkActionBar — generic multi-select bulk bar (§8.6). useMultiSelect drives the cards'
            `selected` ring; the bar slides up at ≥1 selection. Visualize tinted accent, Archive/Delete
            after a divider, Delete disabled with a reason (permission-greying). Bible #composites. */}
        <section id="bulk-actions" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">BulkActionBar</h2>
          <div className="flex items-center gap-sm mb-md">
            <Toggle checked={selectionMode} onChange={setSelectionMode} aria-label="Selection mode" />
            <span className="text-sm text-text-secondary">
              {selectionMode ? 'Selection mode — tap cards to select' : 'Selection mode off'}
            </span>
          </div>
          <div className="grid-cols-entity grid gap-md rounded-lg border border-border bg-surface p-md">
            {bulkCards.map((c) => (
              <EntityCard
                key={c.id}
                colour={c.colour}
                icon={c.icon}
                name={c.name}
                hero={c.hero}
                meta={c.meta}
                selected={bulkSelect.isSelected(c.id)}
                onClick={() =>
                  selectionMode
                    ? bulkSelect.toggle(c.id)
                    : pushToast({ variant: 'info', message: `Open ${c.name} (demo)` })
                }
              />
            ))}
          </div>
          <div className="sticky bottom-lg mt-md">
            <BulkActionBar
              count={bulkSelect.selectedCount}
              onClear={bulkSelect.clear}
              actions={bulkActions}
            />
          </div>
        </section>

        {/* ─────────────────────────── Foundation (bible §0) ─────────────────────────── */}
        <GroupHeading>Foundation</GroupHeading>

        {/* Semantic text & amounts (bible §0.1) */}
        <section id="semantic-text" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">Semantic text &amp; amounts</h2>
          <div className="flex flex-wrap items-center gap-md text-base">
            <span className="monetary-value text-success">+S$ 1,250.00</span>
            <span className="monetary-value text-error">−S$ 84.20</span>
            <span className="text-success">completed</span>
            <span className="text-warning">pending</span>
            <span className="text-info">reconciled</span>
            <span className="text-error-muted">cancelled</span>
          </div>
        </section>

        {/* Icon (wrapper) */}
        <section id="icon" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">Icon</h2>
          <div className="flex items-center gap-density">
            <Icon icon={Home} size={16} />
            <Icon icon={Settings} size={20} />
            <Icon icon={Home} size={16} aria-label="Home" />
          </div>
        </section>

        {/* ─────────────────────── Component Library — primitives (bible §7) ─────────────────────── */}
        <GroupHeading>Primitives</GroupHeading>

        {/* Button */}
        <section id="button" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">Button</h2>
          <div className="flex flex-wrap gap-density">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button disabled>Disabled</Button>
            <Button onClick={() => setButtonClicks((p) => p + 1)}>
              Clicks: {buttonClicks}
            </Button>
          </div>
        </section>

        {/* Badge */}
        <section id="badge" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">Badge</h2>
          <div className="flex flex-wrap gap-density">
            <Badge variant="neutral">Neutral</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="info">Info</Badge>
            <Badge variant="error">Error</Badge>
          </div>
        </section>

        {/* Avatar */}
        <section id="avatar" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">Avatar</h2>
          <div className="flex items-center gap-density">
            <Avatar name="Alice Chen" colour="#6366f1" />
            <Avatar name="Bob Smith" colour="#22c55e" size={40} />
            <Avatar src="https://ui-avatars.com/api/?name=Alice+Chen&background=6366f1&color=fff" name="Alice Chen" />
            <Avatar name="No Image" colour="#ef4444" />
          </div>
        </section>

        {/* SegmentedControl */}
        <section id="segmented-control" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">SegmentedControl</h2>
          <div className="flex flex-col gap-density max-w-input">
            <SegmentedControl value={segmentedValue} options={segmentedOptions} onChange={setSegmentedValue} />
            <SegmentedControl value="all" options={segmentedOptions} onChange={() => {}} disabled />
          </div>
        </section>

        {/* Toggle */}
        <section id="toggle" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">Toggle</h2>
          <div className="flex flex-col gap-density items-start">
            <div className="flex items-center gap-sm">
              <Toggle checked={toggleChecked} onChange={setToggleChecked} aria-label="Toggle example" />
              <span className="text-sm text-text-secondary">{toggleChecked ? 'On' : 'Off'}</span>
            </div>
            <Toggle checked={false} onChange={() => {}} disabled />
          </div>
        </section>

        {/* ProgressBar */}
        <section id="progress-bar" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">ProgressBar</h2>
          <div className="flex flex-col gap-density max-w-input">
            <ProgressBar value={25} />
            <ProgressBar value={60} />
            <ProgressBar value={100} />
          </div>
        </section>

        {/* MiniSparkline — the §9.2 card mini-chart (FR-V-012). Colour comes from --entity-colour (set
            per-tile here); states: line+delta · bar · <2-points placeholder · loading · onExpand seam. */}
        <section id="mini-sparkline" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">MiniSparkline</h2>
          <div className="grid-cols-entity grid gap-md rounded-lg border border-border bg-surface p-md">
            <div className="rounded-lg border border-border bg-surface-raised p-md" style={{ '--entity-colour': '#6366f1' } as CSSProperties}>
              <div className="text-sm text-text-secondary mb-2xs">Line · rising · delta</div>
              <MiniSparkline data={[8, 10, 9, 14, 18, 22, 26, 30]} showDelta />
            </div>
            <div className="rounded-lg border border-border bg-surface-raised p-md" style={{ '--entity-colour': '#ef4444' } as CSSProperties}>
              <div className="text-sm text-text-secondary mb-2xs">Line · falling · delta</div>
              <MiniSparkline data={[30, 28, 30, 22, 18, 14, 9, 6]} showDelta />
            </div>
            <div className="rounded-lg border border-border bg-surface-raised p-md" style={{ '--entity-colour': '#22c55e' } as CSSProperties}>
              <div className="text-sm text-text-secondary mb-2xs">Bar · discrete (budget months)</div>
              <MiniSparkline variant="bar" data={[12, 18, 9, 22, 16, 28, 24]} />
            </div>
            <div className="rounded-lg border border-border bg-surface-raised p-md" style={{ '--entity-colour': '#14b8a6' } as CSSProperties}>
              <div className="text-sm text-text-secondary mb-2xs">&lt; 2 points</div>
              <MiniSparkline data={[42]} />
            </div>
            <div className="rounded-lg border border-border bg-surface-raised p-md">
              <div className="text-sm text-text-secondary mb-2xs">Loading</div>
              <MiniSparkline data={[]} loading />
            </div>
            <div className="rounded-lg border border-border bg-surface-raised p-md" style={{ '--entity-colour': '#8b5cf6' } as CSSProperties}>
              <div className="text-sm text-text-secondary mb-2xs">Expandable (Epic-9 seam)</div>
              <MiniSparkline
                data={[10, 12, 11, 16, 14, 20, 19, 24]}
                showDelta
                onExpand={() => pushToast({ variant: 'info', message: 'Expand → Viewer (Epic 9)' })}
              />
            </div>
          </div>
        </section>

        {/* FavouriteStar — outline gold (off) / solid gold (on); same colour, fill differs (§2.3). The
            distinction toggles on click; hover gives the scale-pop. Colour remaps under immersive themes
            (reads --color-favourite). Bible #entitycard .star/.star.on. */}
        <section id="favourite-star" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">FavouriteStar</h2>
          <div className="flex items-center gap-lg rounded-lg border border-border bg-surface p-md">
            <div className="flex flex-col items-center gap-2xs">
              <FavouriteStar favourite={favOff} onToggle={() => setFavOff((v) => !v)} />
              <span className="text-xs text-text-secondary">off (outline)</span>
            </div>
            <div className="flex flex-col items-center gap-2xs">
              <FavouriteStar favourite={favOn} onToggle={() => setFavOn((v) => !v)} />
              <span className="text-xs text-text-secondary">on (solid)</span>
            </div>
            <div className="flex flex-col items-center gap-2xs">
              <FavouriteStar favourite size={28} onToggle={() => {}} aria-label="Pin to top" />
              <span className="text-xs text-text-secondary">size · label override</span>
            </div>
          </div>
        </section>

        {/* Skeleton */}
        <section id="skeleton" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">Skeleton</h2>
          <div className="flex flex-col gap-density">
            <Skeleton variant="line" className="h-4 w-48" />
            <Skeleton variant="rect" className="h-16 w-48" />
            <Skeleton variant="circle" className="h-10 w-10" />
            {/* Framed stat shape */}
            <Skeleton className="h-20 w-48">
              <div className="h-full w-full flex items-end gap-1 px-2 pb-2">
                <div className="shimmer-gradient animate-shimmer rounded-sm w-4 h-8" />
                <div className="shimmer-gradient animate-shimmer rounded-sm w-4 h-12" />
                <div className="shimmer-gradient animate-shimmer rounded-sm w-4 h-6" />
                <div className="shimmer-gradient animate-shimmer rounded-sm w-4 h-10" />
              </div>
            </Skeleton>
          </div>
        </section>

        {/* Spinner */}
        <section id="spinner" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">Spinner</h2>
          <div className="flex items-center gap-density">
            <Spinner />
            <Spinner size={24} />
            <Spinner size={32} />
          </div>
        </section>

        {/* Divider */}
        <section id="divider" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">Divider</h2>
          <div className="flex flex-col gap-density">
            <span className="text-sm text-text-secondary">Horizontal:</span>
            <Divider />
            <span className="text-sm text-text-secondary">Vertical:</span>
            <div className="flex items-center gap-sm">
              <span>Left</span>
              <Divider orientation="vertical" />
              <span>Right</span>
            </div>
          </div>
        </section>

        {/* ─────────────────────────── Form controls (bible §7) ─────────────────────────── */}
        <GroupHeading>Form controls</GroupHeading>

        {/* Checkbox */}
        <section id="checkbox" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">Checkbox</h2>
          <div className="flex flex-col gap-density">
            <Checkbox checked={checkboxChecked} onChange={setCheckboxChecked} label={`Checked: ${checkboxChecked}`} />
            <Checkbox checked={false} onChange={() => {}} disabled label="Disabled (unchecked)" />
            <Checkbox checked={true} onChange={() => {}} disabled label="Disabled (checked)" />
          </div>
        </section>

        {/* Label */}
        <section id="label" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">Label</h2>
          <div className="flex flex-col gap-density">
            <Label>Plain label</Label>
            <Label required>Required label</Label>
          </div>
        </section>

        {/* Input */}
        <section id="input" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">Input</h2>
          <div className="flex flex-col gap-density max-w-input">
            <div>
              <Label htmlFor="input-default">Default</Label>
              <Input id="input-default" placeholder="Type something…" value={inputValue} onChange={(e) => setInputValue(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="input-error">Error</Label>
              <Input id="input-error" error placeholder="Has error" />
            </div>
            <div>
              <Label htmlFor="input-disabled">Disabled</Label>
              <Input id="input-disabled" disabled value="Cannot edit" />
            </div>
          </div>
        </section>

        {/* Tooltip */}
        <section id="tooltip" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">Tooltip</h2>
          <div className="flex items-center gap-density">
            <Tooltip content="This is a tooltip">
              <Button variant="ghost">Hover me</Button>
            </Tooltip>
            <Tooltip content="Focus me with Tab">
              <Button variant="ghost">Tab target</Button>
            </Tooltip>
          </div>
        </section>

        {/* Card */}
        <section id="card" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">Card</h2>
          <div className="flex flex-col gap-density">
            <Card>
              <p className="text-sm text-text-secondary">Static card with default padding.</p>
            </Card>
            <Card interactive onClick={() => alert('Card clicked')}>
              <p className="text-sm text-text-secondary">Interactive card — hover to see lift effect.</p>
            </Card>
          </div>
        </section>

        {/* ─────────────────────────── Pickers (bible §7) ─────────────────────────── */}
        <GroupHeading>Pickers</GroupHeading>

        {/* Dropdown */}
        <section id="dropdown" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">Dropdown</h2>
          <div className="flex flex-col gap-density max-w-input">
            <Dropdown value={dropdownValue} options={dropdownOptions} onChange={setDropdownValue} placeholder="Select…" />
            <Dropdown value="" options={dropdownOptions} onChange={() => {}} disabled placeholder="Disabled" />
          </div>
        </section>

        {/* ThemePicker — Dropdown + per-theme swatch (UX §5.1 Appearance, Story 2.9). Bound to the
            global theme store so picking a theme reskins this page live. */}
        <section id="theme-picker" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">ThemePicker</h2>
          <div className="flex flex-col gap-density max-w-input">
            <ThemePicker value={themeId} onChange={setTheme} />
            <ThemePicker value={themeId} onChange={() => {}} disabled />
          </div>
        </section>

        {/* ─────────────────────── Feedback & overlay (bible §7 / §8) ─────────────────────── */}
        <GroupHeading>Feedback &amp; overlay</GroupHeading>

        {/* Toast */}
        <section id="toast" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">Toast</h2>
          <div className="flex flex-wrap gap-density">
            <Button variant="secondary" onClick={() => pushToast({ variant: 'info', message: 'Information message' })}>Info</Button>
            <Button variant="secondary" onClick={() => pushToast({ variant: 'success', message: 'Operation successful' })}>Success</Button>
            <Button variant="secondary" onClick={() => pushToast({ variant: 'warning', message: 'Something needs attention' })}>Warning</Button>
            <Button variant="secondary" onClick={() => pushToast({ variant: 'error', message: 'An error occurred' })}>Error</Button>
          </div>
          <p className="text-xs text-text-muted mt-sm">Auto-dismisses after 4s; ✕ dismisses early.</p>
        </section>

        {/* ConfirmationDialog */}
        <section id="confirmation-dialog" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">ConfirmationDialog</h2>
          <div className="flex flex-wrap gap-density">
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>Delete Item</Button>
          </div>
          <ConfirmationDialog
            open={confirmOpen}
            onClose={() => setConfirmOpen(false)}
            onConfirm={() => alert('Confirmed deletion')}
            title="Delete Item"
            message="Are you sure you want to delete this item? This action cannot be undone."
            confirmLabel="Delete"
          />
        </section>

        {/* Modal */}
        <section id="modal" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">Modal</h2>
          <div className="flex flex-wrap gap-density">
            <Button variant="primary" onClick={() => setModalOpen(true)}>Open Modal</Button>
          </div>
          <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Example Modal">
            <p className="text-sm text-text-secondary">
              This is a modal dialog with focus trapping, Esc to close, and backdrop click to close.
            </p>
          </Modal>
        </section>

        {/* ContextMenu */}
        <section id="context-menu" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">ContextMenu</h2>
          <div className="flex items-center gap-density">
            <ContextMenu trigger={<Button variant="ghost"><Icon icon={MoreVertical} size={16} /></Button>} items={contextMenuItems} />
            <span className="text-sm text-text-secondary">Basic menu</span>
            <ContextMenu trigger={<Button variant="ghost"><Icon icon={MoreVertical} size={16} /></Button>} items={contextMenuItemsWithDisabled} />
            <span className="text-sm text-text-secondary">With disabled item</span>
          </div>
        </section>

        {/* ─────────────────────────── States (bible §18) ─────────────────────────── */}
        <GroupHeading>States</GroupHeading>

        {/* EmptyState */}
        <section id="empty-state" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">EmptyState</h2>
          <EmptyState
            icon={SearchX}
            title="No results found"
            description="Try adjusting your search or filter to find what you're looking for."
            action={<Button variant="primary">Clear Filters</Button>}
          />
        </section>

        {/* ─────────────────────────── Public & error (bible §3) ─────────────────────────── */}
        <GroupHeading>Public &amp; error</GroupHeading>

        {/* PublicPage — the shared shell for every UX §3 public/error state (icon-circle/title/subtitle/
            action). Real exported component, one frame per tone; the full 11-state set lives in
            pages/public/publicPages.tsx and renders at the routes (e.g. /login?error=…). Bible §3. */}
        <section id="public-page" className="mb-xl">
          <h2 className="text-lg font-medium mb-sm">PublicPage</h2>
          <div className="grid-cols-entity grid gap-md">
            <div className="overflow-hidden rounded-lg border border-border">
              <PublicPage
                className="min-h-0"
                header={<Spinner size={28} />}
                title="Loading"
                subtitle="Just a moment."
              />
            </div>
            <div className="overflow-hidden rounded-lg border border-border">
              <PublicPage
                className="min-h-0"
                icon={Mail}
                tone="warning"
                title="Not invited"
                subtitle="This account isn't part of a household yet."
                action={<Button variant="primary">Sign in with another account</Button>}
              />
            </div>
            <div className="overflow-hidden rounded-lg border border-border">
              <PublicPage
                className="min-h-0"
                icon={Lock}
                tone="error"
                title="Access denied"
                subtitle="You don't have permission to view this."
                action={<Button variant="secondary">Back to dashboard</Button>}
              />
            </div>
            <div className="overflow-hidden rounded-lg border border-border">
              <PublicPage
                className="min-h-0"
                icon={SearchX}
                tone="neutral"
                title="Not found"
                subtitle="That page doesn't exist."
                action={<Button variant="secondary">Back to dashboard</Button>}
              />
            </div>
            <div className="overflow-hidden rounded-lg border border-border">
              <PublicPage
                className="min-h-0"
                icon={Wrench}
                tone="info"
                title="Maintenance"
                subtitle="Back shortly."
              />
            </div>
          </div>
        </section>
        </div>
      </div>
    </main>
  )
}
