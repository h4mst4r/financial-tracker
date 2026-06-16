import { useState } from 'react'
import {
  Button,
  Input,
  Label,
  Checkbox,
  Toggle,
  Dropdown,
  SegmentedControl,
  Icon,
  Badge,
  Avatar,
  Card,
  Divider,
  Spinner,
  Skeleton,
  ProgressBar,
  Tooltip,
  ContextMenu,
  Modal,
  EmptyState,
  ConfirmationDialog,
} from '../components/primitives'
import { useAlertStore } from '../stores/alertStore'
import { useThemeStore } from '../stores/themeStore'
import type { DensityId } from '../theme/palettes'
import {
  DESIGN_SYSTEM_GROUPS,
  DESIGN_SYSTEM_SECTIONS,
} from './designSystemSections'
import {
  Home,
  Settings,
  MoreVertical,
  Edit,
  Trash2,
  Copy,
  Archive,
  SearchX,
} from 'lucide-react'

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

  const pushToast = useAlertStore((s) => s.pushToast)

  // Density harness: bound to the global theme store (not local state) — useAppearance writes it to
  // <html data-density>, which drives the --density-* CSS vars, so every section re-renders live.
  // This is the dev harness built from SegmentedControl; the Phase-3 DensityToggle composite (UX §7,
  // Settings) is a separate later story and intentionally NOT built here.
  const density = useThemeStore((s) => s.density)
  const setDensity = useThemeStore((s) => s.setDensity)

  const contextMenuItems = [
    { label: 'Edit', icon: Edit, onClick: () => {} },
    { label: 'Duplicate', icon: Copy, onClick: () => {} },
    { label: 'Archive', icon: Archive, onClick: () => {} },
    { divider: true } as const,
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
        </div>
      </div>
    </main>
  )
}
