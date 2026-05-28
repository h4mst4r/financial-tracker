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
import { ToastContainer } from '../components/ui/Toast'
import { useAlertStore } from '../store/alertStore'

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
  children,
}: {
  title: string
  bug?: string
  children: React.ReactNode
}) => (
  <div>
    <div className="flex items-center gap-2 mb-3">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">{title}</h3>
      {bug && (
        <span className="text-xs bg-error-bg text-error border border-error/30 px-2 py-0.5 rounded-full font-medium">
          ⚠ BUG: {bug}
        </span>
      )}
    </div>
    <div className="flex flex-wrap gap-5 items-start">{children}</div>
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

const TOC_ITEMS = [
  { id: 'colors', label: 'Colors & Typography' },
  { id: 'atoms', label: 'Atoms' },
  { id: 'buttons', label: 'Buttons' },
  { id: 'inputs', label: 'Inputs' },
  { id: 'form-controls', label: 'Form Controls' },
  { id: 'cards', label: 'Cards' },
  { id: 'overlays', label: 'Overlays' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'data', label: 'Data' },
  { id: 'actions', label: 'Actions' },
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

  const enqueue = useAlertStore((s) => s.enqueue)

  const parseRule = (text: string) => ({
    valid: /every|daily|weekly|monthly|yearly|\d+(st|nd|rd|th)/i.test(text),
    nextDate: new Date(),
  })

  return (
    <div className="flex bg-bg">
      <ToastContainer />

      {/* Sticky sidebar TOC */}
      <aside className="hidden lg:flex flex-col w-44 shrink-0 sticky top-0 self-start max-h-screen overflow-y-auto border-r border-border p-4 gap-1">
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
            All UI components displayed with every variant, size, and state. Bugs are annotated in red.
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

          <Sub title="Semantic text colors">
            <Labeled label="text-primary"><span className="text-sm text-text-primary font-medium">Primary</span></Labeled>
            <Labeled label="text-secondary"><span className="text-sm text-text-secondary">Secondary</span></Labeled>
            <Labeled label="text-muted"><span className="text-sm text-text-muted">Muted</span></Labeled>
            <Labeled label="text-inverse"><span className="text-sm text-text-inverse bg-bg-surface-raised px-2 py-0.5 rounded">Inverse</span></Labeled>
            <Labeled label="text-success"><span className="text-sm text-success font-medium">Success</span></Labeled>
            <Labeled label="text-warning"><span className="text-sm text-warning font-medium">Warning</span></Labeled>
            <Labeled label="text-error"><span className="text-sm text-error font-medium">Error</span></Labeled>
            <Labeled label="text-info"><span className="text-sm text-info font-medium">Info</span></Labeled>
            <Labeled label="text-accent"><span className="text-sm text-accent font-medium">Accent</span></Labeled>
          </Sub>

          <Sub title="Surface tokens">
            {[
              { token: 'bg-bg', label: 'bg-bg' },
              { token: 'bg-surface', label: 'bg-surface' },
              { token: 'bg-surface-raised', label: 'bg-surface-raised' },
              { token: 'bg-surface-hover', label: 'bg-surface-hover' },
              { token: 'bg-surface-overlay', label: 'bg-surface-overlay' },
            ].map(({ token, label }) => (
              <Labeled key={token} label={label}>
                <div className={`w-20 h-10 rounded border border-border ${token}`} />
              </Labeled>
            ))}
          </Sub>

          <Sub title="Semantic fill tokens">
            {[
              { token: 'bg-accent', label: 'bg-accent' },
              { token: 'bg-success-bg', label: 'bg-success-bg' },
              { token: 'bg-warning-bg', label: 'bg-warning-bg' },
              { token: 'bg-error-bg', label: 'bg-error-bg' },
              { token: 'bg-info-bg', label: 'bg-info-bg' },
            ].map(({ token, label }) => (
              <Labeled key={token} label={label}>
                <div className={`w-20 h-10 rounded border border-border ${token}`} />
              </Labeled>
            ))}
          </Sub>
        </Section>

        {/* ── Atoms ─────────────────────────────────────────────────────────── */}
        <Section id="atoms" title="Atoms">

          <Sub title="Spinner — sizes">
            <Labeled label="sm"><Spinner size="sm" /></Labeled>
            <Labeled label="md"><Spinner size="md" /></Labeled>
            <Labeled label="lg"><Spinner size="lg" /></Labeled>
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

          <Sub title="Tooltip">
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
          </Sub>
        </Section>

        {/* ── Buttons ────────────────────────────────────────────────────────── */}
        <Section id="buttons" title="Buttons">

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
            <Labeled label="loading primary"><Button variant="primary" loading>Saving…</Button></Labeled>
            <Labeled label="loading secondary"><Button variant="secondary" loading>Loading…</Button></Labeled>
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

          <Sub title="EmojiIconPicker">
            <Wide label="emojis + icons tabs, search, recently used (click to open)" maxWidth="200px">
              <EmojiIconPicker
                value={emojiValue || undefined}
                onChange={(v) => setEmojiValue(v)}
              />
            </Wide>
            <Wide label="disabled with pre-selected emoji" maxWidth="200px">
              <EmojiIconPicker value="💰" onChange={() => {}} disabled />
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
            <Labeled label="elevated">
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

          <Sub title="Entity accent (left border)">
            {[
              { token: '--color-entity-account', label: 'entity-account' },
              { token: '--color-entity-event', label: 'entity-event' },
              { token: '--color-entity-budget', label: 'entity-budget' },
              { token: '--color-entity-person', label: 'entity-person' },
            ].map(({ token, label }) => (
              <Labeled key={token} label={label}>
                <Card variant="default" entityAccent={token} className="w-44">
                  <p className="text-sm font-medium text-text-primary capitalize">{label.replace('entity-', '')}</p>
                  <p className="text-xs text-text-muted mt-1">Left accent border</p>
                </Card>
              </Labeled>
            ))}
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

          <Sub title="ConfirmationDialog">
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
            <Wide label="card"><div className="bg-surface p-3 rounded-lg border border-border"><Skeleton shape="card" /></div></Wide>
            <Wide label="table-row"><div className="bg-surface rounded-lg border border-border"><Skeleton shape="table-row" /></div></Wide>
            <Wide label="chart"><div className="bg-surface p-3 rounded-lg border border-border"><Skeleton shape="chart" /></div></Wide>
            <Wide label="stat"><div className="bg-surface p-3 rounded-lg border border-border"><Skeleton shape="stat" /></div></Wide>
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
                    title: 'What is a budget?',
                    content: (
                      <p className="text-sm text-text-secondary">
                        A budget sets a spending limit for a category over a monthly or yearly period. Actuals are computed dynamically from transactions.
                      </p>
                    ),
                  },
                  {
                    title: 'How are shared expenses tracked?',
                    content: (
                      <p className="text-sm text-text-secondary">
                        Transactions flagged as shared (outflows only) are included in household debt calculations between members.
                      </p>
                    ),
                  },
                  {
                    title: 'Can I import from my bank?',
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
                  { title: 'Section A', content: <p className="text-sm text-text-secondary">Content A — open alongside B.</p> },
                  { title: 'Section B', content: <p className="text-sm text-text-secondary">Content B — open alongside A.</p> },
                  { title: 'Section C', content: <p className="text-sm text-text-secondary">Content C</p> },
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
          </Sub>
        </Section>

        {/* Footer spacer */}
        <div className="h-20" />
      </div>
    </div>
  )
}
