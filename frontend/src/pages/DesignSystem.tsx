import React, { useState } from 'react'
import {
  Bell, Settings, DollarSign, Plus, Info,
  Trash2, Archive, Download,
} from 'lucide-react'

// Layer 1 — Atoms
import { Spinner } from '../components/ui/Spinner'
import { Icon } from '../components/ui/Icon'
import { Badge } from '../components/ui/Badge'
import { Avatar, AvatarStack } from '../components/ui/Avatar'
import { Divider } from '../components/ui/Divider'
import { Label } from '../components/ui/Label'
import { Tooltip } from '../components/ui/Tooltip'

// Layer 2 — Buttons & Inputs
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'

// Layer 3 — Form controls
import { Checkbox } from '../components/ui/Checkbox'
import { Toggle } from '../components/ui/Toggle'
import { Dropdown } from '../components/ui/Dropdown'
import type { DropdownOption } from '../components/ui/Dropdown'
import { DatePicker } from '../components/ui/DatePicker'
import { ColourPicker } from '../components/ui/ColourPicker'
import { EmojiIconPicker } from '../components/ui/EmojiIconPicker'
import { TagInput } from '../components/ui/TagInput'
import { MonetaryValueInput } from '../components/ui/MonetaryValueInput'
import { RecurringDateInput } from '../components/ui/RecurringDateInput'

// Layer 4 — Containers
import { Card } from '../components/ui/Card'
import { Modal } from '../components/ui/Modal'
import { Drawer } from '../components/ui/Drawer'
import { ConfirmationDialog } from '../components/ui/ConfirmationDialog'
import { Accordion } from '../components/ui/Accordion'
import { Table } from '../components/ui/Table'
import type { Column } from '../components/ui/Table'
import { ContextMenu } from '../components/ui/ContextMenu'

// Feedback
import { AlertBanner } from '../components/ui/AlertBanner'
import { ProgressBar } from '../components/ui/ProgressBar'
import { Skeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'

import { useAlertStore } from '../store/alertStore'

// Layer 9 — Entity components
import { EntityCard } from '../components/entity/EntityCard'
import { EntityPage } from '../components/entity/EntityPage'
import { BulkActionBar } from '../components/entity/BulkActionBar'

// SegmentedControl — extracted from inline pattern (P6 AUTH-005 patch)
import { SegmentedControl } from '../components/ui/SegmentedControl'

// Public pages — §9.6 uses inline card previews rather than full-page embeds
// because PublicPage uses min-h-screen which cannot be scoped to a preview container.

// ─── Layout helpers ────────────────────────────────────────────────────────────

const Section = ({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) => (
  <section id={id} className="mb-14 scroll-mt-4">
    <h2 className="text-xl font-semibold text-text-primary pb-2 mb-5 border-b border-border">
      {title}
    </h2>
    <div className="space-y-8">{children}</div>
  </section>
)

const Sub = ({
  title,
  bug,
  grid,
  children,
}: {
  title: string
  bug?: string
  /** Use a uniform CSS grid instead of flex-wrap — for colour/token swatches */
  grid?: boolean
  children: React.ReactNode
}) => (
  <div>
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">{title}</h3>
      {bug && (
        <span className="text-xs bg-error-muted text-error border border-error/30 px-2 py-0.5 rounded-full font-medium">
          ⚠ BUG: {bug}
        </span>
      )}
    </div>
    <div className={grid
      ? 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3'
      : 'flex flex-wrap gap-5 items-start'}
    >
      {children}
    </div>
  </div>
)

const Labeled = ({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) => (
  <div className="flex flex-col gap-1.5 items-start min-w-0">
    {children}
    <span className="text-2xs text-text-muted font-mono">{label}</span>
  </div>
)

const Wide = ({
  label,
  maxWidth,
  children,
}: {
  label: string
  maxWidth?: string
  children: React.ReactNode
}) => (
  <div className="w-full" style={maxWidth ? { maxWidth } : undefined}>
    <p className="text-2xs text-text-muted font-mono mb-2">{label}</p>
    {children}
  </div>
)

// ─── Sample data ───────────────────────────────────────────────────────────────

type TxRow = { name: string; amount: string; status: string; date: string }

const TX_DATA: TxRow[] = [
  { name: 'Groceries', amount: '$84.50', status: 'completed', date: '2026-05-01' },
  { name: 'Electricity', amount: '$120.00', status: 'pending', date: '2026-05-03' },
  { name: 'Netflix', amount: '$18.00', status: 'completed', date: '2026-05-05' },
]

const TX_COLS: Column<TxRow>[] = [
  { key: 'name', header: 'Name', sortable: true, render: (r) => r.name },
  { key: 'amount', header: 'Amount', sortable: true, render: (r) => r.amount },
  { key: 'status', header: 'Status', sortable: true, render: (r) => r.status },
  { key: 'date', header: 'Date', sortable: true, render: (r) => r.date },
]

const CURRENCIES = [
  { code: 'USD', symbol: '$' },
  { code: 'SGD', symbol: 'S$' },
  { code: 'EUR', symbol: '€' },
]

const ACCOUNT_OPTIONS: DropdownOption[] = [
  { value: 'bank', label: 'Bank Account' },
  { value: 'credit', label: 'Credit Card' },
  { value: 'capital', label: 'Capital' },
  { value: 'asset', label: 'Asset' },
  { value: 'insurance', label: 'Insurance' },
]

// All 14 entity accent colours from EDP §14.5
const ENTITY_ACCENTS = [
  { key: 'account',   hex: '#6366f1', label: 'account (indigo)' },
  { key: 'credit',    hex: '#ef4444', label: 'credit (red)' },
  { key: 'capital',   hex: '#10b981', label: 'capital (green)' },
  { key: 'asset',     hex: '#f59e0b', label: 'asset (amber)' },
  { key: 'insurance', hex: '#06b6d4', label: 'insurance (cyan)' },
  { key: 'event',     hex: '#8b5cf6', label: 'event (purple)' },
  { key: 'recurring', hex: '#ec4899', label: 'recurring (pink)' },
  { key: 'transfer',  hex: '#14b8a6', label: 'transfer (teal)' },
  { key: 'budget',    hex: '#f97316', label: 'budget (orange)' },
  { key: 'category',  hex: '#06b6d4', label: 'category (cyan)' },
  { key: 'currency',  hex: '#a78bfa', label: 'currency (violet)' },
  { key: 'formula',   hex: '#6ee7b7', label: 'formula (mint)' },
  { key: 'debt',      hex: '#ef4444', label: 'debt (red)' },
  { key: 'person',    hex: '#38bdf8', label: 'person (sky)' },
]

// Demo entities for entity component section
type DemoEntity = {
  id: string
  name: string
  status: string
  updatedAt: string
  archived: boolean
}

const DEMO_ENTITIES: DemoEntity[] = [
  { id: '1', name: 'DBS Savings',          status: 'active',   updatedAt: '2026-05-29T10:00:00Z', archived: false },
  { id: '2', name: 'UOB Credit Card',      status: 'active',   updatedAt: '2026-05-28T15:30:00Z', archived: false },
  { id: '3', name: 'Investment Portfolio', status: 'inactive', updatedAt: '2026-05-27T09:00:00Z', archived: false },
  { id: '4', name: 'HDB Flat',             status: 'active',   updatedAt: '2026-05-26T12:00:00Z', archived: false },
  { id: '5', name: 'Old Wallet',           status: 'archived', updatedAt: '2026-05-20T08:00:00Z', archived: true  },
]

const TOC_ITEMS = [
  { id: 'colors',       label: 'Colors & Typography' },
  { id: 'atoms',        label: 'Atoms' },
  { id: 'buttons',      label: 'Buttons & Controls' },
  { id: 'inputs',       label: 'Inputs' },
  { id: 'form-controls',label: 'Form Controls' },
  { id: 'cards',        label: 'Cards' },
  { id: 'overlays',     label: 'Overlays' },
  { id: 'feedback',     label: 'Feedback' },
  { id: 'data',         label: 'Data' },
  { id: 'actions',      label: 'Actions' },
  { id: 'entity',       label: 'Entity Components' },
]

// ─── Page ──────────────────────────────────────────────────────────────────────

export const DesignSystem: React.FC = () => {
  // Overlay state
  const [modalOpen, setModalOpen] = useState(false)
  const [modalDirty, setModalDirty] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [confirmWarningOpen, setConfirmWarningOpen] = useState(false)
  const [confirmDangerOpen, setConfirmDangerOpen] = useState(false)

  // Form control state
  const [checkA, setCheckA] = useState(false)
  const [checkB, setCheckB] = useState(true)
  const [checkNoLabel, setCheckNoLabel] = useState(false)
  const [toggleA, setToggleA] = useState(false)
  const [toggleB, setToggleB] = useState(true)
  const [dropSingle, setDropSingle] = useState('')
  const [dropSearchable, setDropSearchable] = useState('')
  const [dropMulti, setDropMulti] = useState<string[]>([])
  const [dateValue, setDateValue] = useState<Date | undefined>(new Date())
  const [colourValue, setColourValue] = useState('#6366f1')
  const [emojiValue, setEmojiValue] = useState('')
  const [tags, setTags] = useState(['groceries', 'bills'])
  const [monCurrency, setMonCurrency] = useState('USD')
  const [monAmount, setMonAmount] = useState<number | string>('125.50')
  const [recurText, setRecurText] = useState('')
  const [recurConfirmed, setRecurConfirmed] = useState(false)

  // Dismissible state
  const [showBadges, setShowBadges] = useState({
    success: true, warning: true, error: true, info: true, neutral: true,
  })
  const [showBanners, setShowBanners] = useState({
    success: true, warning: true, error: true, info: true,
  })

  // Multi-select demo state (for standalone BulkActionBar demo)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())


  // Segmented control demo state
  const [demoViewMode, setDemoViewMode] = useState<'household' | 'personal'>('household')
  const [demoRangeMode, setDemoRangeMode] = useState<'day' | 'week' | 'month'>('week')

  const enqueue = useAlertStore((s) => s.enqueue)

  const parseRule = (text: string) => ({
    valid: /every|daily|weekly|monthly|yearly|\d+(st|nd|rd|th)/i.test(text),
    nextDate: new Date(),
  })

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="flex bg-bg">

      {/* Sticky sidebar TOC — overflow-y-auto with scrollbar hidden so only one scroll rail is visible (the main page rail) */}
      <aside className="hidden lg:flex flex-col w-44 shrink-0 sticky top-0 self-start max-h-screen overflow-y-auto border-r border-border p-4 gap-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <p className="text-3xs font-semibold text-text-muted uppercase tracking-widest mb-2">
          Contents
        </p>
        {TOC_ITEMS.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className="block text-sm text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded px-2 py-1 transition-colors"
          >
            {item.label}
          </a>
        ))}
      </aside>

      {/* Main content */}
      <div className="flex-1 p-6 max-w-4xl">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-text-primary mb-1">Design System</h1>
          <p className="text-text-secondary text-sm">
            All UI components with every variant, size, and state. Known bugs annotated in red.
          </p>
        </div>

        {/* ── Colors & Typography ─────────────────────────────────────────── */}
        <Section id="colors" title="Colors & Typography">
          <Sub title="Text scale">
            <Labeled label="text-3xl bold"><p className="text-3xl font-bold text-text-primary">Display</p></Labeled>
            <Labeled label="text-2xl semibold"><p className="text-2xl font-semibold text-text-primary">Heading 1</p></Labeled>
            <Labeled label="text-xl semibold"><p className="text-xl font-semibold text-text-primary">Heading 2</p></Labeled>
            <Labeled label="text-lg medium"><p className="text-lg font-medium text-text-primary">Heading 3</p></Labeled>
            <Labeled label="text-sm"><p className="text-sm text-text-primary">Body text</p></Labeled>
            <Labeled label="text-xs muted"><p className="text-xs text-text-muted">Caption / meta</p></Labeled>
            <Labeled label="font-mono"><p className="text-sm font-mono text-text-primary">Monospace</p></Labeled>
          </Sub>

          <Sub title="Semantic text colors" grid>
            <Labeled label="text-primary"><span className="text-sm text-text-primary font-medium">Primary</span></Labeled>
            <Labeled label="text-secondary"><span className="text-sm text-text-secondary">Secondary</span></Labeled>
            <Labeled label="text-muted"><span className="text-sm text-text-muted">Muted</span></Labeled>
            <Labeled label="text-inverse (white — for coloured/accent surfaces)"><span className="text-sm text-text-inverse bg-primary px-2 rounded">Inverse on primary</span></Labeled>
            <Labeled label="text-success"><span className="text-sm text-success font-medium">Success</span></Labeled>
            <Labeled label="text-warning"><span className="text-sm text-warning font-medium">Warning</span></Labeled>
            <Labeled label="text-error"><span className="text-sm text-error font-medium">Error</span></Labeled>
            <Labeled label="text-info"><span className="text-sm text-info font-medium">Info</span></Labeled>
            <Labeled label="text-accent"><span className="text-sm text-accent font-medium">Accent</span></Labeled>
          </Sub>

          <Sub title="Surface tokens" grid>
            {[
              { token: 'bg-bg',              label: 'bg-bg' },
              { token: 'bg-surface',         label: 'bg-surface' },
              { token: 'bg-surface-raised',  label: 'bg-surface-raised' },
              { token: 'bg-surface-hover',   label: 'bg-surface-hover' },
              { token: 'bg-surface-overlay', label: 'bg-surface-overlay' },
            ].map(({ token, label }) => (
              <Labeled key={token} label={label}>
                <div className={`w-20 h-10 rounded border border-border ${token}`} />
              </Labeled>
            ))}
          </Sub>

          <Sub title="Semantic fill tokens" grid>
            {[
              { token: 'bg-primary',        label: 'bg-primary' },
              { token: 'bg-success-muted',  label: 'bg-success-muted' },
              { token: 'bg-warning-muted',  label: 'bg-warning-muted' },
              { token: 'bg-error-muted',    label: 'bg-error-muted' },
              { token: 'bg-info-muted',     label: 'bg-info-muted' },
              { token: 'bg-accent-subtle',  label: 'bg-accent-subtle (nav active, 15%)' },
              { token: 'bg-control-active', label: 'bg-control-active (tab active, 20%)' },
              { token: 'bg-backdrop',       label: 'bg-backdrop (modal overlay)' },
            ].map(({ token, label }) => (
              <Labeled key={token} label={label}>
                <div className={`w-20 h-10 rounded border border-border ${token}`} />
              </Labeled>
            ))}
          </Sub>

          <Sub title="Border tokens" grid>
            {[
              { token: 'border-border',              label: 'border (default)' },
              { token: 'border-border-strong',       label: 'border-strong' },
              { token: 'border-border-focus',        label: 'border-focus' },
              { token: 'border-border-error',        label: 'border-error' },
              { token: 'border-border-state',        label: 'border-state (control outer)' },
              { token: 'border-border-state-subtle', label: 'border-state-subtle (divider)' },
            ].map(({ token, label }) => (
              <Labeled key={token} label={label}>
                <div className={`w-20 h-10 rounded bg-surface-raised border-2 ${token}`} />
              </Labeled>
            ))}
          </Sub>

          <Sub title="Focus ring glows — ring-glow-* tokens">
            <Labeled label="ring-glow-primary (text input focused)">
              <div className="w-20 h-10 rounded bg-surface-raised ring-2 ring-glow-primary border border-border-focus" />
            </Labeled>
            <Labeled label="ring-glow-accent (picker trigger open — Dropdown, DatePicker, ColourPicker, EmojiIconPicker)">
              <div className="w-20 h-10 rounded bg-surface-raised ring-2 ring-glow-accent border border-accent" />
            </Labeled>
            <Labeled label="ring-glow-error (error input focused)">
              <div className="w-20 h-10 rounded bg-surface-raised ring-2 ring-glow-error border border-border-error" />
            </Labeled>
          </Sub>

          <Sub title="Entity accent utilities — CSS-var pattern (--entity-accent)">
            <Labeled label="border-entity-accent (4px bar)">
              <div
                className="w-20 h-10 rounded bg-surface-raised border-entity-accent"
                style={{ '--entity-accent': 'var(--color-entity-account)' } as React.CSSProperties}
              />
            </Labeled>
            <Labeled label="bg-entity-accent-muted (15% fill)">
              <div
                className="w-20 h-10 rounded bg-entity-accent-muted border border-border"
                style={{ '--entity-accent': 'var(--color-entity-capital)' } as React.CSSProperties}
              />
            </Labeled>
            <Labeled label="text-entity-accent">
              <span
                className="text-sm font-semibold text-entity-accent"
                style={{ '--entity-accent': 'var(--color-entity-budget)' } as React.CSSProperties}
              >
                Entity text
              </span>
            </Labeled>
          </Sub>

          {/* Entity accent colours — all 14 from EDP §14.5 */}
          <Sub title="Entity accent colours (EDP §14.5 — all 14 families)">
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-4 w-full">
              {ENTITY_ACCENTS.map(({ key, hex, label }) => (
                <div key={key} className="flex flex-col gap-1 items-start">
                  <div
                    className="w-full h-10 rounded border border-border"
                    style={{ backgroundColor: `var(--color-entity-${key})` }}
                  />
                  <span className="text-2xs text-text-muted font-mono">--color-entity-{key}</span>
                  <span className="text-2xs text-text-disabled font-mono">{hex}</span>
                  <span className="text-2xs text-text-secondary">{label}</span>
                </div>
              ))}
            </div>
          </Sub>
        </Section>

        {/* ── Atoms ─────────────────────────────────────────────────────────── */}
        <Section id="atoms" title="Atoms">

          <Sub title="Spinner — sizes (standalone, explicit color)">
            <Labeled label="sm"><Spinner size="sm" color="var(--color-primary)" /></Labeled>
            <Labeled label="md"><Spinner size="md" color="var(--color-primary)" /></Labeled>
            <Labeled label="lg"><Spinner size="lg" color="var(--color-primary)" /></Labeled>
          </Sub>

          <Sub title="Icon — sizes">
            <Labeled label="xs"><Icon icon={Bell} size="xs" /></Labeled>
            <Labeled label="sm"><Icon icon={Bell} size="sm" /></Labeled>
            <Labeled label="md"><Icon icon={Bell} size="md" /></Labeled>
            <Labeled label="lg"><Icon icon={Bell} size="lg" /></Labeled>
            <Labeled label="xl"><Icon icon={Bell} size="xl" /></Labeled>
          </Sub>

          <Sub title="Badge — variants (click × to dismiss)">
            {showBadges.success && (
              <Labeled label="success">
                <Badge variant="success" dismissible onDismiss={() => setShowBadges((p) => ({ ...p, success: false }))}>Paid</Badge>
              </Labeled>
            )}
            {showBadges.warning && (
              <Labeled label="warning">
                <Badge variant="warning" dismissible onDismiss={() => setShowBadges((p) => ({ ...p, warning: false }))}>Pending</Badge>
              </Labeled>
            )}
            {showBadges.error && (
              <Labeled label="error">
                <Badge variant="error" dismissible onDismiss={() => setShowBadges((p) => ({ ...p, error: false }))}>Overdue</Badge>
              </Labeled>
            )}
            {showBadges.info && (
              <Labeled label="info">
                <Badge variant="info" dismissible onDismiss={() => setShowBadges((p) => ({ ...p, info: false }))}>Syncing</Badge>
              </Labeled>
            )}
            {showBadges.neutral && (
              <Labeled label="neutral">
                <Badge variant="neutral" dismissible onDismiss={() => setShowBadges((p) => ({ ...p, neutral: false }))}>Draft</Badge>
              </Labeled>
            )}
            <Labeled label="entity (custom accent)">
              <Badge variant="entity" entityAccent="#10b981">Investment</Badge>
            </Labeled>
            <Labeled label="entity #6366f1">
              <Badge variant="entity" entityAccent="#6366f1">Capital</Badge>
            </Labeled>
          </Sub>

          <Sub title="Avatar — sizes">
            <Labeled label="sm initials"><Avatar size="sm" name="Alice B" /></Labeled>
            <Labeled label="md initials"><Avatar size="md" name="Alice B" /></Labeled>
            <Labeled label="lg initials"><Avatar size="lg" name="Alice B" /></Labeled>
            <Labeled label="xl initials"><Avatar size="xl" name="Alice B" /></Labeled>
            <Labeled label="pictureUrl"><Avatar size="md" pictureUrl="https://i.pravatar.cc/40?img=3" name="Bob" /></Labeled>
            <Labeled label="archived"><Avatar size="md" name="Charlie D" archived /></Labeled>
            <Labeled label="single name"><Avatar size="md" name="Madonna" /></Labeled>
          </Sub>

          <Sub title="AvatarStack — overflow indicator">
            <Labeled label="maxVisible=3, 5 total">
              <AvatarStack
                size="md"
                maxVisible={3}
                avatars={[
                  { name: 'Alice' },
                  { name: 'Bob' },
                  { name: 'Charlie' },
                  { name: 'Diana' },
                  { name: 'Evan' },
                ]}
              />
            </Labeled>
            <Labeled label="maxVisible=5, 5 total (no overflow)">
              <AvatarStack
                size="sm"
                maxVisible={5}
                avatars={[{ name: 'Alice' }, { name: 'Bob' }, { name: 'Charlie' }, { name: 'Diana' }, { name: 'Evan' }]}
              />
            </Labeled>
          </Sub>

          <Sub title="Divider">
            <Wide label="horizontal default" maxWidth="400px">
              <Divider />
            </Wide>
            <Wide label='horizontal with label="OR"' maxWidth="400px">
              <Divider label="OR" />
            </Wide>
            <Wide label="horizontal light variant" maxWidth="400px">
              <Divider variant="light" />
            </Wide>
            <Labeled label="vertical (inline)">
              <div className="flex items-center h-8 px-3 bg-surface border border-border rounded text-sm text-text-secondary">
                Left<Divider orientation="vertical" />Right
              </div>
            </Labeled>
          </Sub>

          <Sub title="Label — states">
            <Wide label="plain" maxWidth="260px">
              <Label htmlFor="demo-plain">Account name</Label>
            </Wide>
            <Wide label="required" maxWidth="260px">
              <Label htmlFor="demo-req" required>Amount</Label>
            </Wide>
            <Wide label="with helper text" maxWidth="260px">
              <Label htmlFor="demo-helper" helper="Max 100 characters">Description</Label>
            </Wide>
            <Wide label="with error message" maxWidth="260px">
              <Label htmlFor="demo-err" error="This field is required">Category</Label>
            </Wide>
          </Sub>

          <Sub
            title="Tooltip — hover / focus to reveal"
          >
            <Labeled label="hover / focus to reveal">
              <Tooltip content="This is a tooltip with contextual information.">
                <Button variant="secondary" size="sm">Hover me</Button>
              </Tooltip>
            </Labeled>
            <Labeled label="long text wraps at 280px">
              <Tooltip content="This is a much longer tooltip that exceeds the 280px max-width and should wrap onto multiple lines gracefully.">
                <Button variant="ghost" size="sm">Long tooltip</Button>
              </Tooltip>
            </Labeled>
            <Labeled label="custom delay=600ms">
              <Tooltip content="Slow reveal (600ms delay)" delay={600}>
                <Button variant="icon" aria-label="Info"><Icon icon={Info} size="md" /></Button>
              </Tooltip>
            </Labeled>
            <Labeled label="auto-flips to bottom near viewport top edge">
              <Tooltip content="This tooltip automatically flips below when triggered near the top edge.">
                <Button variant="ghost" size="sm">Edge-aware</Button>
              </Tooltip>
            </Labeled>
          </Sub>
        </Section>

        {/* ── Buttons ────────────────────────────────────────────────────────── */}
        <Section id="buttons" title="Buttons & Controls">

          <Sub title="Variants (size md)">
            <Labeled label="primary"><Button variant="primary">Primary</Button></Labeled>
            <Labeled label="secondary"><Button variant="secondary">Secondary</Button></Labeled>
            <Labeled label="ghost"><Button variant="ghost">Ghost</Button></Labeled>
            <Labeled label="danger"><Button variant="danger">Danger</Button></Labeled>
            <Labeled label="icon">
              <Button variant="icon" aria-label="Settings"><Icon icon={Settings} size="md" /></Button>
            </Labeled>
          </Sub>

          <Sub title="Sizes (primary variant)">
            <Labeled label="sm"><Button variant="primary" size="sm">Small</Button></Labeled>
            <Labeled label="md"><Button variant="primary" size="md">Medium</Button></Labeled>
            <Labeled label="lg"><Button variant="primary" size="lg">Large</Button></Labeled>
          </Sub>

          <Sub title="States">
            <Labeled label="loading primary (spinner visibility test)">
              <Button variant="primary" loading>Saving…</Button>
            </Labeled>
            <Labeled label="loading secondary">
              <Button variant="secondary" loading>Loading…</Button>
            </Labeled>
            <Labeled label="disabled primary"><Button variant="primary" disabled>Disabled</Button></Labeled>
            <Labeled label="disabled secondary"><Button variant="secondary" disabled>Disabled</Button></Labeled>
            <Labeled label="disabled danger"><Button variant="danger" disabled>Disabled</Button></Labeled>
          </Sub>

          <Sub title="With icon children">
            <Labeled label="primary + leading icon">
              <Button variant="primary"><Icon icon={Plus} size="sm" />Add Transaction</Button>
            </Labeled>
            <Labeled label="secondary + trailing icon">
              <Button variant="secondary">Export<Icon icon={Download} size="sm" /></Button>
            </Labeled>
            <Labeled label="icon variant (sm)">
              <Button variant="icon" size="sm" aria-label="Archive"><Icon icon={Archive} size="sm" /></Button>
            </Labeled>
            <Labeled label="icon variant (lg)">
              <Button variant="icon" size="lg" aria-label="Delete"><Icon icon={Trash2} size="lg" /></Button>
            </Labeled>
          </Sub>

          <Sub title="Segmented Control — view mode toggle">
            <Labeled label="expanded (interactive)">
              <div className="space-y-1.5">
                <SegmentedControl
                  options={[
                    { value: 'household', label: 'Household' },
                    { value: 'personal', label: 'My Finances' },
                  ]}
                  value={demoViewMode}
                  onChange={setDemoViewMode}
                  className="w-48"
                />
                <p className="text-2xs text-text-muted font-mono">Active: {demoViewMode}</p>
              </div>
            </Labeled>
            <Labeled label="collapsed (single char + title tooltip)">
              <SegmentedControl
                options={[
                  { value: 'household', label: 'Household' },
                  { value: 'personal', label: 'My Finances' },
                ]}
                value={demoViewMode}
                onChange={setDemoViewMode}
                collapsed
                className="w-14"
              />
            </Labeled>
            <Labeled label="three options (interactive)">
              <SegmentedControl
                options={[
                  { value: 'day', label: 'Day' },
                  { value: 'week', label: 'Week' },
                  { value: 'month', label: 'Month' },
                ]}
                value={demoRangeMode}
                onChange={setDemoRangeMode}
                className="w-52"
              />
            </Labeled>
          </Sub>
        </Section>

        {/* ── Inputs ─────────────────────────────────────────────────────────── */}
        <Section id="inputs" title="Inputs">

          <Sub title="Variants">
            <Wide label="text (default)" maxWidth="360px">
              <Input variant="text" placeholder="Enter account name…" />
            </Wide>
            <Wide label="search (built-in icon + clear)" maxWidth="360px">
              <Input variant="search" placeholder="Search transactions…" />
            </Wide>
            <Wide label="number (right-aligned)" maxWidth="200px">
              <Input variant="number" placeholder="0.00" />
            </Wide>
            <Wide label="password (toggle visibility)" maxWidth="280px">
              <Input variant="password" placeholder="Enter password…" />
            </Wide>
          </Sub>

          <Sub title="States">
            <Wide label="error state" maxWidth="360px">
              <Input variant="text" error="Amount must be greater than 0" placeholder="Amount" />
            </Wide>
            <Wide label="disabled" maxWidth="360px">
              <Input variant="text" disabled value="Read only value" readOnly />
            </Wide>
            <Wide label="readOnly" maxWidth="360px">
              <Input variant="text" readOnly value="Cannot edit this" />
            </Wide>
            <Wide label="leading icon" maxWidth="360px">
              <Input
                variant="text"
                leading={<Icon icon={DollarSign} size="sm" />}
                placeholder="Amount"
              />
            </Wide>
            <Wide label="trailing icon" maxWidth="360px">
              <Input
                variant="text"
                trailing={<Icon icon={Info} size="sm" />}
                placeholder="BSB"
              />
            </Wide>
          </Sub>
        </Section>

        {/* ── Form Controls ──────────────────────────────────────────────────── */}
        <Section id="form-controls" title="Form Controls">

          <Sub title="Checkbox">
            <Labeled label="unchecked">
              <Checkbox checked={checkA} onChange={setCheckA}>Unchecked</Checkbox>
            </Labeled>
            <Labeled label="checked">
              <Checkbox checked={checkB} onChange={setCheckB}>Checked</Checkbox>
            </Labeled>
            <Labeled label="indeterminate">
              <Checkbox checked={false} indeterminate>Indeterminate</Checkbox>
            </Labeled>
            <Labeled label="disabled unchecked">
              <Checkbox checked={false} disabled>Disabled</Checkbox>
            </Labeled>
            <Labeled label="disabled checked">
              <Checkbox checked disabled>Disabled checked</Checkbox>
            </Labeled>
            <Labeled label="no label">
              <Checkbox checked={checkNoLabel} onChange={setCheckNoLabel} />
            </Labeled>
          </Sub>

          <Sub title="Toggle">
            <Labeled label="off (interactive)"><Toggle checked={toggleA} onChange={setToggleA} /></Labeled>
            <Labeled label="on (interactive)"><Toggle checked={toggleB} onChange={setToggleB} /></Labeled>
            <Labeled label="disabled off"><Toggle checked={false} disabled /></Labeled>
            <Labeled label="disabled on"><Toggle checked disabled /></Labeled>
          </Sub>

          <Sub title="Dropdown — single select">
            <Wide label="clearable, no selection → select → clear" maxWidth="320px">
              <Dropdown
                variant="single"
                options={ACCOUNT_OPTIONS}
                value={dropSingle}
                onChange={setDropSingle}
                placeholder="Select account type…"
                clearable
              />
            </Wide>
            <Wide label="disabled with pre-selected value" maxWidth="320px">
              <Dropdown
                variant="single"
                options={ACCOUNT_OPTIONS}
                value="bank"
                onChange={() => {}}
                disabled
              />
            </Wide>
            <Wide label="error state" maxWidth="320px">
              <Dropdown
                options={ACCOUNT_OPTIONS}
                value=""
                onChange={() => {}}
                error="Please select an account type"
              />
            </Wide>
          </Sub>

          <Sub title="Dropdown — searchable">
            <Wide label="type to filter options" maxWidth="320px">
              <Dropdown
                variant="searchable"
                options={ACCOUNT_OPTIONS}
                value={dropSearchable}
                onChange={setDropSearchable}
                placeholder="Search account type…"
                clearable
              />
            </Wide>
          </Sub>

          <Sub title="Dropdown — multi select">
            <Wide label="select multiple values" maxWidth="320px">
              <Dropdown
                variant="multi"
                options={ACCOUNT_OPTIONS}
                values={dropMulti}
                onChange={() => {}}
                onMultiChange={setDropMulti}
                placeholder="Select account types…"
                clearable
              />
            </Wide>
            {dropMulti.length > 0 && (
              <Wide label="selected values" maxWidth="400px">
                <div className="flex gap-2 flex-wrap">
                  {dropMulti.map((v) => (
                    <Badge key={v} variant="info">{v}</Badge>
                  ))}
                </div>
              </Wide>
            )}
          </Sub>

          <Sub title="DatePicker">
            <Wide label="with today pre-selected" maxWidth="280px">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <DatePicker value={dateValue as any} onChange={setDateValue} />
            </Wide>
            <Wide label="error state (no date)" maxWidth="280px">
              <DatePicker value={undefined} onChange={() => {}} error="Date is required" />
            </Wide>
            <Wide label="disabled" maxWidth="280px">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <DatePicker value={new Date() as any} onChange={() => {}} disabled />
            </Wide>
          </Sub>

          <Sub title="ColourPicker">
            <Wide label="palette tab (click to open)" maxWidth="280px">
              <ColourPicker value={colourValue} onChange={setColourValue} />
            </Wide>
            <Wide label="disabled" maxWidth="280px">
              <ColourPicker value="#6366f1" onChange={() => {}} disabled />
            </Wide>
          </Sub>

          <Sub
            title="EmojiIconPicker"
          >
            <Wide label="emojis + icons tabs, search, recently used (click to open)" maxWidth="200px">
              <EmojiIconPicker
                value={emojiValue || undefined}
                onChange={(v) => setEmojiValue(v)}
              />
            </Wide>
            <Wide label="disabled with pre-selected emoji" maxWidth="200px">
              <EmojiIconPicker value="ðŸ’°" onChange={() => {}} disabled />
            </Wide>
          </Sub>

          <Sub title="TagInput">
            <Wide label="press Enter or comma to add; Backspace to remove last" maxWidth="500px">
              <TagInput value={tags} onChange={setTags} placeholder="Add a tag…" />
            </Wide>
            <Wide label="empty state" maxWidth="500px">
              <TagInput value={[]} onChange={() => {}} placeholder="No tags yet — type here" />
            </Wide>
          </Sub>

          <Sub title="MonetaryValueInput">
            <Wide label="single currency (no FX)" maxWidth="360px">
              <MonetaryValueInput
                currencies={CURRENCIES}
                currency={monCurrency}
                amount={monAmount}
                onChange={(c, a) => { setMonCurrency(c); setMonAmount(a) }}
              />
            </Wide>
            <Wide label="with FX delta (SGD amount, USD base @ 0.74)" maxWidth="360px">
              <MonetaryValueInput
                currencies={CURRENCIES}
                currency="SGD"
                amount="200"
                baseCurrency="USD"
                exchangeRate={0.74}
                onChange={() => {}}
              />
            </Wide>
            <Wide label="error state" maxWidth="360px">
              <MonetaryValueInput
                currencies={CURRENCIES}
                currency="USD"
                amount=""
                onChange={() => {}}
                error="Amount is required"
              />
            </Wide>
          </Sub>

          <Sub title="RecurringDateInput">
            <Wide label='try: "every Monday", "1st of month", "daily"' maxWidth="480px">
              <RecurringDateInput
                value={recurText}
                confirmed={recurConfirmed}
                parseRule={parseRule}
                onChange={(v, c) => { setRecurText(v); setRecurConfirmed(c) }}
              />
            </Wide>
            <Wide label="confirmed state" maxWidth="480px">
              <RecurringDateInput
                value="every Monday"
                confirmed
                parseRule={parseRule}
                onChange={() => {}}
              />
            </Wide>
          </Sub>
        </Section>

        {/* ── Cards ──────────────────────────────────────────────────────────── */}
        <Section id="cards" title="Cards">

          <Sub title="Variants">
            <Labeled label="default">
              <Card variant="default" className="w-52">
                <p className="text-sm font-medium text-text-primary">Default card</p>
                <p className="text-xs text-text-muted mt-1">bg-surface with border</p>
              </Card>
            </Labeled>
            <Labeled label="stat">
              <Card variant="stat" className="w-52">
                <p className="text-2xl font-bold text-text-primary">$2,450</p>
                <p className="text-xs text-text-muted mt-1">Monthly spend</p>
              </Card>
            </Labeled>
            <Labeled
              label="elevated"
            >
              <Card variant="elevated" className="w-52">
                <p className="text-sm font-medium text-text-primary">Elevated card</p>
                <p className="text-xs text-text-muted mt-1">bg-surface-raised + shadow</p>
              </Card>
            </Labeled>
            <Labeled label="ghost">
              <Card variant="ghost" className="w-52">
                <p className="text-sm font-medium text-text-primary">Ghost card</p>
                <p className="text-xs text-text-muted mt-1">No background fill</p>
              </Card>
            </Labeled>
          </Sub>

          <Sub title="Entity accent (left border) — all 14 entities">
            <div className="w-full grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {[
                { token: 'var(--color-entity-account)',   label: 'account'   },
                { token: 'var(--color-entity-credit)',    label: 'credit'    },
                { token: 'var(--color-entity-capital)',   label: 'capital'   },
                { token: 'var(--color-entity-asset)',     label: 'asset'     },
                { token: 'var(--color-entity-insurance)', label: 'insurance' },
                { token: 'var(--color-entity-event)',     label: 'event'     },
                { token: 'var(--color-entity-recurring)', label: 'recurring' },
                { token: 'var(--color-entity-transfer)',  label: 'transfer'  },
                { token: 'var(--color-entity-budget)',    label: 'budget'    },
                { token: 'var(--color-entity-category)',  label: 'category'  },
                { token: 'var(--color-entity-currency)',  label: 'currency'  },
                { token: 'var(--color-entity-formula)',   label: 'formula'   },
                { token: 'var(--color-entity-debt)',      label: 'debt'      },
                { token: 'var(--color-entity-person)',    label: 'person'    },
              ].map(({ token, label }) => (
                <Card key={token} variant="default" entityAccent={token}>
                  <p className="text-xs font-semibold text-text-primary capitalize">{label}</p>
                  <p className="text-2xs text-text-muted mt-0.5 font-mono">entity-{label}</p>
                </Card>
              ))}
            </div>
          </Sub>

          <Sub title="Clickable (hover to see lift)">
            <Labeled label="onClick → lift + shadow">
              <Card variant="default" className="w-52" onClick={() => {}}>
                <p className="text-sm font-medium text-text-primary">Clickable card</p>
                <p className="text-xs text-text-muted mt-1">hover: translate-y + shadow</p>
              </Card>
            </Labeled>
          </Sub>
        </Section>

        {/* ── Overlays ───────────────────────────────────────────────────────── */}
        <Section id="overlays" title="Overlays">

          <Sub title="Modal">
            <Labeled label="sm size, isDirty guard, focus trap, Escape to close">
              <Button variant="secondary" onClick={() => setModalOpen(true)}>Open Modal</Button>
            </Labeled>
            <p className="w-full text-xs text-text-muted mt-1">
              Responsiveness note: on mobile (&lt;768px) this modal renders as a bottom-sheet (rounded-t-xl, items-end). Resize browser to verify.
            </p>
          </Sub>

          <Modal
            isOpen={modalOpen}
            onClose={() => { setModalOpen(false); setModalDirty(false) }}
            title="Create Account"
            size="sm"
            isDirty={modalDirty}
          >
            <div className="space-y-4">
              <p className="text-text-secondary text-sm">
                Focus is trapped within this dialog. Typing below sets isDirty — close will confirm first.
              </p>
              <div className="space-y-1">
                <Label htmlFor="modal-name" required>Account name</Label>
                <Input
                  id="modal-name"
                  placeholder="e.g. DBS Savings"
                  onChange={() => setModalDirty(true)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="modal-type">Account type</Label>
                <Dropdown
                  options={ACCOUNT_OPTIONS}
                  value=""
                  onChange={() => setModalDirty(true)}
                  placeholder="Select type…"
                />
              </div>
              <p className="text-xs text-text-muted">
                isDirty: <strong>{String(modalDirty)}</strong>
              </p>
              <div className="flex gap-2 justify-end pt-2 border-t border-border">
                <Button variant="secondary" onClick={() => { setModalOpen(false); setModalDirty(false) }}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => { setModalOpen(false); setModalDirty(false) }}>
                  Create
                </Button>
              </div>
            </div>
          </Modal>

          <Sub title="Drawer">
            <Labeled label="slides from right, md size, Escape to close">
              <Button variant="secondary" onClick={() => setDrawerOpen(true)}>Open Drawer</Button>
            </Labeled>
            <p className="w-full text-xs text-text-muted mt-1">
              Responsiveness note: on mobile, Drawer is full-width (w-full). Resize to verify.
            </p>
          </Sub>

          <Drawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} title="Filter Transactions" size="md">
            <div className="space-y-4">
              <p className="text-text-secondary text-sm">
                Drawer body — focus is trapped, Escape closes.
              </p>
              <Input variant="search" placeholder="Search…" />
              <div className="space-y-2">
                <Label>Account type</Label>
                <Dropdown options={ACCOUNT_OPTIONS} value="" onChange={() => {}} placeholder="Any type" />
              </div>
              <div className="space-y-2">
                <Label>Date range</Label>
                <DatePicker value={undefined} onChange={() => {}} />
              </div>
              <Button variant="primary" onClick={() => setDrawerOpen(false)} className="w-full">
                Apply Filters
              </Button>
            </div>
          </Drawer>

          <Sub
            title="ConfirmationDialog"
          >
            <Labeled label="warning variant">
              <Button variant="secondary" onClick={() => setConfirmWarningOpen(true)}>
                Warning Dialog
              </Button>
            </Labeled>
            <Labeled label="danger variant">
              <Button variant="danger" onClick={() => setConfirmDangerOpen(true)}>
                Danger Dialog
              </Button>
            </Labeled>
          </Sub>

          <ConfirmationDialog
            isOpen={confirmWarningOpen}
            onClose={() => setConfirmWarningOpen(false)}
            onConfirm={() => {
              setConfirmWarningOpen(false)
              enqueue({ variant: 'success', title: 'Archived', message: 'Account was archived.' })
            }}
            variant="warning"
            title="Archive this account?"
            message="The account will be hidden from active views. You can restore it from Settings."
            confirmLabel="Archive"
          />

          <ConfirmationDialog
            isOpen={confirmDangerOpen}
            onClose={() => setConfirmDangerOpen(false)}
            onConfirm={() => {
              setConfirmDangerOpen(false)
              enqueue({ variant: 'error', title: 'Deleted', message: 'This action cannot be undone.' })
            }}
            variant="danger"
            title="Delete permanently?"
            message="All transactions and history associated with this account will be permanently removed."
            confirmLabel="Delete forever"
          />
        </Section>

        {/* ── Feedback ───────────────────────────────────────────────────────── */}
        <Section id="feedback" title="Feedback">

          <Sub title="AlertBanner — variants (click × to dismiss)">
            {showBanners.success && (
              <Wide label="success">
                <AlertBanner
                  variant="success"
                  title="Import complete"
                  message="12 transactions were imported successfully."
                  onDismiss={() => setShowBanners((p) => ({ ...p, success: false }))}
                />
              </Wide>
            )}
            {showBanners.warning && (
              <Wide label="warning">
                <AlertBanner
                  variant="warning"
                  title="Low balance"
                  message="Your DBS Savings account is below $100."
                  onDismiss={() => setShowBanners((p) => ({ ...p, warning: false }))}
                />
              </Wide>
            )}
            {showBanners.error && (
              <Wide label="error">
                <AlertBanner
                  variant="error"
                  title="Import failed"
                  message="Could not parse 3 rows. Check the CSV column mapping."
                  onDismiss={() => setShowBanners((p) => ({ ...p, error: false }))}
                />
              </Wide>
            )}
            {showBanners.info && (
              <Wide label="info (no dismiss button)">
                <AlertBanner
                  variant="info"
                  message="FX rates are refreshed every 24 hours from ExchangeRate-API."
                />
              </Wide>
            )}
          </Sub>

          <Sub title="Toast — trigger buttons (appear top-right)">
            {(['success', 'warning', 'error', 'info'] as const).map((v) => (
              <Labeled key={v} label={v}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    enqueue({
                      variant: v,
                      title: `${v.charAt(0).toUpperCase() + v.slice(1)} notification`,
                      message: `This is a sample ${v} toast.`,
                    })
                  }
                >
                  {v}
                </Button>
              </Labeled>
            ))}
            <Labeled label="no message (title only)">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => enqueue({ variant: 'success', title: 'Saved!' })}
              >
                title only
              </Button>
            </Labeled>
          </Sub>

          <Sub title="ProgressBar — variant × value">
            <Wide label="default 40%" maxWidth="400px">
              <ProgressBar value={40} max={100} showLabel />
            </Wide>
            <Wide label="budget 55% — green" maxWidth="400px">
              <ProgressBar value={55} max={100} variant="budget" showLabel />
            </Wide>
            <Wide label="budget 85% — warning" maxWidth="400px">
              <ProgressBar value={85} max={100} variant="budget" showLabel />
            </Wide>
            <Wide label="budget 105% — error (clamped to 100%)" maxWidth="400px">
              <ProgressBar value={105} max={100} variant="budget" showLabel />
            </Wide>
            <Wide label="height sm" maxWidth="400px">
              <ProgressBar value={60} max={100} height="sm" />
            </Wide>
          </Sub>

          <Sub title="Skeleton — shapes">
            <Wide label="card"><div className="bg-bg p-2 rounded-lg"><Skeleton shape="card" /></div></Wide>
            <Wide label="table-row"><div className="bg-surface rounded-lg border border-border"><Skeleton shape="table-row" /></div></Wide>
            <Wide label="chart"><div className="bg-bg p-2 rounded-lg"><Skeleton shape="chart" /></div></Wide>
            <Wide label="stat"><div className="bg-bg p-2 rounded-lg"><Skeleton shape="stat" /></div></Wide>
          </Sub>

          <Sub title="EmptyState">
            <Wide label="with action button">
              <EmptyState
                title="No transactions yet"
                description="Add your first transaction to start tracking your household finances."
                actionLabel="Add Transaction"
                onAction={() => enqueue({ variant: 'info', title: 'Add transaction clicked' })}
              />
            </Wide>
            <Divider />
            <Wide label="filtered state (link instead of button)">
              <EmptyState
                title="No results"
                description="Try adjusting your filters or clearing the search query."
                isFiltered
                actionLabel="Clear filters"
                onAction={() => enqueue({ variant: 'info', title: 'Clear filters clicked' })}
              />
            </Wide>
            <Divider />
            <Wide label="no action">
              <EmptyState title="Nothing here" description="There is nothing to display right now." />
            </Wide>
          </Sub>
        </Section>

        {/* ── Data ───────────────────────────────────────────────────────────── */}
        <Section id="data" title="Data">

          <Sub title="Table — sortable, row click">
            <Wide label="click column headers to sort; click row to trigger toast">
              <Table
                columns={TX_COLS}
                data={TX_DATA}
                onSort={(key, dir) => enqueue({ variant: 'info', title: `Sort: ${key} ${dir}` })}
                onRowClick={(row) => enqueue({ variant: 'info', title: 'Row clicked', message: row.name })}
              />
            </Wide>
          </Sub>

          <Sub title="Table — with row actions (ContextMenu-per-row)">
            <Wide label="⋮ menu per row — never inline action buttons">
              <Table
                columns={TX_COLS}
                data={TX_DATA}
                rowActions={(row) => [
                  { label: 'Edit', onClick: () => enqueue({ variant: 'info', title: `Edit: ${row.name}` }) },
                  { label: 'Duplicate', onClick: () => enqueue({ variant: 'info', title: `Duplicate: ${row.name}` }) },
                  { divider: true },
                  { label: 'Delete', onClick: () => enqueue({ variant: 'error', title: `Delete: ${row.name}` }), destructive: true },
                ]}
              />
            </Wide>
          </Sub>

          <Sub title="Table — states">
            <Wide label="loading=true">
              <Table columns={TX_COLS} data={[]} loading />
            </Wide>
            <Wide label="empty data">
              <Table columns={TX_COLS} data={[]} emptyMessage="No transactions for this period" />
            </Wide>
          </Sub>

          <Sub title="Accordion">
            <Wide label="single-open (default — opening one closes others)">
              <Accordion
                items={[
                  {
                    label: 'What is a budget?',
                    content: (
                      <p className="text-sm text-text-secondary">
                        A budget sets a spending limit for a category over a monthly or yearly period. Actuals are computed dynamically from transactions.
                      </p>
                    ),
                  },
                  {
                    label: 'How are shared expenses tracked?',
                    content: (
                      <p className="text-sm text-text-secondary">
                        Transactions flagged as shared (outflows only) are included in household debt calculations between members.
                      </p>
                    ),
                  },
                  {
                    label: 'Can I import from my bank?',
                    content: (
                      <p className="text-sm text-text-secondary">
                        Yes — use the CSV import wizard in Import/Export. Column mapping is configurable per institution.
                      </p>
                    ),
                  },
                ]}
              />
            </Wide>
            <Wide label="allowMultiple=true — multiple sections open simultaneously">
              <Accordion
                allowMultiple
                items={[
                  { label: 'Section A', content: <p className="text-sm text-text-secondary">Content A — open alongside B.</p> },
                  { label: 'Section B', content: <p className="text-sm text-text-secondary">Content B — open alongside A.</p> },
                  { label: 'Section C', content: <p className="text-sm text-text-secondary">Content C</p> },
                ]}
              />
            </Wide>
          </Sub>
        </Section>

        {/* ── Actions ────────────────────────────────────────────────────────── */}
        <Section id="actions" title="Actions">

          <Sub title="ContextMenu">
            <Labeled label="default ⋮ trigger">
              <ContextMenu
                items={[
                  {
                    label: 'Edit',
                    onClick: () => enqueue({ variant: 'info', title: 'Edit clicked' }),
                  },
                  {
                    label: 'Archive',
                    onClick: () => enqueue({ variant: 'warning', title: 'Archive clicked' }),
                  },
                  {
                    label: 'Delete',
                    onClick: () => enqueue({ variant: 'error', title: 'Delete clicked' }),
                    destructive: true,
                    divider: true,
                  },
                  {
                    label: 'Disabled action',
                    onClick: () => {},
                    disabled: true,
                  },
                ]}
              />
            </Labeled>
            <Labeled label="custom trigger (Button)">
              <ContextMenu
                trigger={<Button variant="secondary" size="sm">Options</Button>}
                items={[
                  { label: 'Export CSV', onClick: () => enqueue({ variant: 'success', title: 'Exported' }) },
                  { label: 'Duplicate', onClick: () => enqueue({ variant: 'info', title: 'Duplicated' }) },
                  { label: 'View history', onClick: () => {} },
                ]}
              />
            </Labeled>
            <Labeled label="with divider groups">
              <ContextMenu
                items={[
                  { label: 'View details', onClick: () => {} },
                  { label: 'Edit', onClick: () => {} },
                  { label: 'Duplicate', onClick: () => {}, divider: true },
                  { label: 'Archive', onClick: () => {} },
                  { label: 'Delete', onClick: () => {}, destructive: true, divider: true },
                ]}
              />
            </Labeled>
            <Labeled label="right-aligned (tests viewport clamp)">
              <div className="flex justify-end">
                <ContextMenu
                  items={[
                    { label: 'Edit', onClick: () => {} },
                    { label: 'Archive', onClick: () => {} },
                    { label: 'Delete', onClick: () => enqueue({ variant: 'error', title: 'Delete clicked' }), destructive: true, divider: true },
                  ]}
                />
              </div>
            </Labeled>
          </Sub>
        </Section>

        {/* ── Entity Components (Layer 9) ─────────────────────────────────── */}
        <Section id="entity" title="Entity Components">

          {/* EntityCard variants */}
          <Sub title="EntityCard — variants">
            <Wide label="active — variant=default, entityAccent=account (indigo)" maxWidth="380px">
              <EntityCard
                entity={{ id: '1', name: 'DBS Savings', status: 'active', updatedAt: '2026-05-29T10:00:00Z', archived: false }}
                entityAccent="var(--color-entity-account)"
                onEdit={() => enqueue({ variant: 'info', title: 'Edit clicked' })}
                onDuplicate={() => enqueue({ variant: 'info', title: 'Duplicate clicked' })}
                onArchive={() => enqueue({ variant: 'warning', title: 'Archive clicked' })}
                onDelete={() => enqueue({ variant: 'error', title: 'Delete clicked' })}
              />
            </Wide>

            <Wide label="archived — 60% opacity, restore in context menu" maxWidth="380px">
              <EntityCard
                entity={{ id: '2', name: 'Old Credit Card', status: 'archived', updatedAt: '2026-05-20T08:00:00Z', archived: true }}
                entityAccent="var(--color-entity-credit)"
                onRestore={() => enqueue({ variant: 'success', title: 'Restore clicked' })}
                onDelete={() => enqueue({ variant: 'error', title: 'Delete clicked' })}
              />
            </Wide>

            <Wide label="inactive — warning badge" maxWidth="380px">
              <EntityCard
                entity={{ id: '3', name: 'Paused Insurance', status: 'inactive', updatedAt: '2026-05-25T12:00:00Z', archived: false }}
                entityAccent="var(--color-entity-insurance)"
                onEdit={() => enqueue({ variant: 'info', title: 'Edit clicked' })}
                onArchive={() => enqueue({ variant: 'warning', title: 'Archive clicked' })}
              />
            </Wide>

            <Wide label="with renderBody — shows custom content slot" maxWidth="380px">
              <EntityCard
                entity={{ id: '4', name: 'Investment Portfolio', status: 'active', updatedAt: '2026-05-28T09:00:00Z', archived: false }}
                entityAccent="var(--color-entity-capital)"
                onEdit={() => enqueue({ variant: 'info', title: 'Edit clicked' })}
                renderBody={() => (
                  <p className="text-sm text-text-muted">Balance: <span className="font-mono text-text-primary">SGD 48,200.00</span></p>
                )}
              />
            </Wide>
          </Sub>

          {/* EntityPage action bar */}
          <Sub title="EntityPage — action bar + Show Archived toggle">
            <Wide label="full-width action bar; Create fires toast; toggle logs state change">
              <div className="bg-surface-raised border border-border rounded-lg p-4">
                <EntityPage
                  title="Accounts"
                  onCreateClick={() => enqueue({ variant: 'success', title: 'Create clicked' })}
                  onShowArchivedChange={(v) => enqueue({ variant: 'info', title: `Show archived: ${v}` })}
                  onBulkArchive={(ids) => enqueue({ variant: 'warning', title: `Bulk archive: ${ids.join(', ')}` })}
                  onBulkDelete={(ids) => enqueue({ variant: 'error', title: `Bulk delete: ${ids.join(', ')}` })}
                  items={DEMO_ENTITIES}
                  renderCard={(entity, selected) => (
                    <EntityCard
                      key={entity.id}
                      entity={entity}
                      entityAccent="var(--color-entity-account)"
                      selected={selected}
                      onSelect={(id, mods) => enqueue({ variant: 'info', title: `Selected ${id}`, message: `ctrl:${mods.ctrl} shift:${mods.shift}` })}
                      onEdit={() => enqueue({ variant: 'info', title: `Edit ${entity.name}` })}
                    />
                  )}
                />
              </div>
            </Wide>
          </Sub>

          {/* BulkActionBar standalone */}
          <Sub
            title="BulkActionBar — standalone demo (click cards to select)"
          >
            <Wide label="EntityCard selection = ring-2 ring-primary. Click cards to select; BulkActionBar appears when ≥1 selected">
              <div className="space-y-2">
                {DEMO_ENTITIES.filter((e) => !e.archived).map((entity) => (
                  <EntityCard
                    key={entity.id}
                    entity={entity}
                    entityAccent="var(--color-entity-account)"
                    selected={selectedIds.has(entity.id)}
                    onSelect={(id) => toggleSelect(id)}
                    onEdit={() => enqueue({ variant: 'info', title: `Edit ${entity.name}` })}
                    onArchive={() => enqueue({ variant: 'warning', title: `Archive ${entity.name}` })}
                  />
                ))}

                <BulkActionBar
                  selectedCount={selectedIds.size}
                  onArchive={() => {
                    enqueue({ variant: 'warning', title: `Archive ${selectedIds.size} items` })
                    setSelectedIds(new Set())
                  }}
                  onDelete={() => {
                    enqueue({ variant: 'error', title: `Delete ${selectedIds.size} items` })
                    setSelectedIds(new Set())
                  }}
                  onClear={() => setSelectedIds(new Set())}
                />
              </div>
              <p className="text-2xs text-text-muted mt-3 font-mono">
                {selectedIds.size === 0 ? 'No selection' : `Selected: ${[...selectedIds].join(', ')}`}
              </p>
            </Wide>
          </Sub>

        </Section>

        {/* ── §9.6 Public Pages ─────────────────────────────────────────── */}
        <Section title="§9.6 Public Pages" id="public-pages">
          <p className="text-sm text-text-secondary mb-4">
            Shell-less centred layout. PublicPage uses <code className="text-accent text-xs">min-h-screen bg-bg</code> at
            runtime — cannot be embedded directly (viewport-relative height). Shown here as card-only previews
            that mirror the real component structure; kept manually in sync. To verify full-page layout:
            navigate to <code className="text-accent text-xs">/login</code> while signed out, or{' '}
            <code className="text-accent text-xs">/join/00000000-0000-0000-0000-000000000000</code>.
          </p>
          {/* 2-column grid of page state previews */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
            {/* Login — default */}
            <div className="bg-bg rounded-xl border border-border-light p-6 space-y-2">
              <p className="text-2xs text-text-muted font-mono uppercase tracking-wide mb-3">Login — default</p>
              <h1 className="text-2xl font-semibold text-text-primary text-center mb-2">Financial Tracker</h1>
              <p className="text-text-secondary text-sm text-center mb-6">Sign in to manage your finances</p>
              <div className="bg-surface-raised border border-border rounded-lg p-6">
                <Button variant="primary" className="w-full justify-center">Sign in with Google</Button>
              </div>
            </div>
            {/* Login — after household deleted */}
            <div className="bg-bg rounded-xl border border-border-light p-6 space-y-2">
              <p className="text-2xs text-text-muted font-mono uppercase tracking-wide mb-3">Login — ?deleted=1</p>
              <h1 className="text-2xl font-semibold text-text-primary text-center mb-2">Financial Tracker</h1>
              <div className="bg-surface-raised border border-border rounded-lg p-6 space-y-4">
                <AlertBanner variant="success" message="Your household has been deleted. Sign in to create a new one." />
                <Button variant="primary" className="w-full justify-center">Sign in with Google</Button>
              </div>
            </div>
            {/* 404 */}
            <div className="bg-bg rounded-xl border border-border-light p-6">
              <p className="text-2xs text-text-muted font-mono uppercase tracking-wide mb-3">404 — Not Found</p>
              <h1 className="text-2xl font-semibold text-text-primary text-center mb-6">Financial Tracker</h1>
              <div className="bg-surface-raised border border-border rounded-lg p-6">
                <h2 className="text-xl font-semibold text-text-primary mb-2">404 — Page Not Found</h2>
                <p className="text-text-secondary text-sm mb-6">The page you&apos;re looking for doesn&apos;t exist or has been moved.</p>
                <Button variant="secondary">Go to Dashboard</Button>
              </div>
            </div>
            {/* 403 */}
            <div className="bg-bg rounded-xl border border-border-light p-6">
              <p className="text-2xs text-text-muted font-mono uppercase tracking-wide mb-3">403 — Not Authorized</p>
              <h1 className="text-2xl font-semibold text-text-primary text-center mb-6">Financial Tracker</h1>
              <div className="bg-surface-raised border border-border rounded-lg p-6">
                <h2 className="text-xl font-semibold text-text-primary mb-2">403 — Not Authorized</h2>
                <p className="text-text-secondary text-sm mb-6">You don&apos;t have permission to access this page.</p>
                <Button variant="secondary">Sign In</Button>
              </div>
            </div>
            {/* JoinHousehold — invitation */}
            <div className="bg-bg rounded-xl border border-border-light p-6">
              <p className="text-2xs text-text-muted font-mono uppercase tracking-wide mb-3">JoinHousehold — invitation</p>
              <h1 className="text-2xl font-semibold text-text-primary text-center mb-6">Financial Tracker</h1>
              <div className="bg-surface-raised border border-border rounded-lg p-6 space-y-4">
                <div>
                  <p className="text-text-secondary text-sm">You&apos;ve been invited to join</p>
                  <p className="text-text-primary font-semibold text-lg">Smith Family</p>
                </div>
                <div className="text-text-secondary text-sm space-y-1">
                  <p>Invited by Alice Smith</p>
                  <p>Expires 11 Jun 2026</p>
                </div>
                <div className="flex flex-col gap-2">
                  <Button variant="primary">Accept Invitation</Button>
                  <Button variant="secondary">Decline</Button>
                </div>
              </div>
            </div>
            {/* JoinHousehold — 404 error */}
            <div className="bg-bg rounded-xl border border-border-light p-6">
              <p className="text-2xs text-text-muted font-mono uppercase tracking-wide mb-3">JoinHousehold — 404 error</p>
              <h1 className="text-2xl font-semibold text-text-primary text-center mb-6">Financial Tracker</h1>
              <div className="bg-surface-raised border border-border rounded-lg p-6 space-y-4">
                <AlertBanner variant="error" message="Invitation not found" />
                <Button variant="secondary">Back to Login</Button>
              </div>
            </div>
            {/* JoinHousehold — 410 expired */}
            <div className="bg-bg rounded-xl border border-border-light p-6">
              <p className="text-2xs text-text-muted font-mono uppercase tracking-wide mb-3">JoinHousehold — 410 expired</p>
              <h1 className="text-2xl font-semibold text-text-primary text-center mb-6">Financial Tracker</h1>
              <div className="bg-surface-raised border border-border rounded-lg p-6 space-y-4">
                <AlertBanner variant="error" message="This invitation has expired or is no longer valid" />
                <Button variant="secondary">Back to Login</Button>
              </div>
            </div>
          </div>
        </Section>

        {/* Footer spacer */}
        <div className="h-20" />
      </div>
    </div>
  )
}
