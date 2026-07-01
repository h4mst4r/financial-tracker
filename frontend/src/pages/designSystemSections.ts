// Single source of truth for the /design-system page layout (story 1.8c).
// The page renders its section nav from DESIGN_SYSTEM_SECTIONS (in this order), and the P1
// completeness guard (design-system-completeness.test.tsx) asserts every exported primitive maps to
// a section here — so nav, content order, and the P1 gate can't silently drift apart.

export interface DesignSystemSection {
  /** Matches the `id` on the section's <section> element and the nav link `href="#id"`. */
  id: string
  label: string
  group: DesignSystemGroup
}

/** Group order mirrors the design bible's grouped left nav (#library). Sections render in this order. */
export const DESIGN_SYSTEM_GROUPS = [
  'Composites',
  'Foundation',
  'Primitives',
  'Form controls',
  'Pickers',
  'Category Components',
  'Feedback & overlay',
  'States',
  'Public & error',
] as const
export type DesignSystemGroup = (typeof DESIGN_SYSTEM_GROUPS)[number]

/** Ordered to match the DOM order of the <section> blocks in DesignSystem.tsx (do not reorder — P5/AC4). */
export const DESIGN_SYSTEM_SECTIONS: DesignSystemSection[] = [
  // Composites first — mirrors the design bible, where #shell/EntityPage precedes the #library primitives.
  { id: 'app-shell', label: 'AppShell', group: 'Composites' },
  { id: 'entity-page', label: 'EntityPage', group: 'Composites' },
  { id: 'entity-card', label: 'EntityCard', group: 'Composites' },
  { id: 'entity-modal', label: 'EntityModal', group: 'Composites' },
  { id: 'bulk-actions', label: 'BulkActionBar', group: 'Composites' },
  { id: 'table', label: 'Table', group: 'Composites' },
  { id: 'filterbar', label: 'FilterBar', group: 'Composites' },
  { id: 'semantic-text', label: 'Semantic text & amounts', group: 'Foundation' },
  { id: 'value-atoms', label: 'Value atoms', group: 'Foundation' },
  { id: 'icon', label: 'Icon', group: 'Foundation' },
  { id: 'button', label: 'Button', group: 'Primitives' },
  { id: 'badge', label: 'Badge', group: 'Primitives' },
  { id: 'dot', label: 'Dot', group: 'Primitives' },
  { id: 'avatar', label: 'Avatar', group: 'Primitives' },
  { id: 'segmented-control', label: 'SegmentedControl', group: 'Primitives' },
  { id: 'toggle', label: 'Toggle', group: 'Primitives' },
  { id: 'progress-bar', label: 'ProgressBar', group: 'Primitives' },
  { id: 'mini-sparkline', label: 'MiniSparkline', group: 'Primitives' },
  { id: 'favourite-star', label: 'FavouriteStar', group: 'Primitives' },
  { id: 'skeleton', label: 'Skeleton', group: 'Primitives' },
  { id: 'spinner', label: 'Spinner', group: 'Primitives' },
  { id: 'divider', label: 'Divider', group: 'Primitives' },
  { id: 'zone', label: 'Zone', group: 'Primitives' },
  { id: 'checkbox', label: 'Checkbox', group: 'Form controls' },
  { id: 'label', label: 'Label', group: 'Form controls' },
  { id: 'input', label: 'Input', group: 'Form controls' },
  { id: 'monetary-value-input', label: 'MonetaryValueInput', group: 'Form controls' },
  { id: 'tooltip', label: 'Tooltip', group: 'Form controls' },
  { id: 'card', label: 'Card', group: 'Form controls' },
  { id: 'dropdown', label: 'Dropdown', group: 'Pickers' },
  { id: 'date-picker', label: 'DatePicker', group: 'Pickers' },
  { id: 'theme-picker', label: 'ThemePicker', group: 'Pickers' },
  { id: 'colour-picker', label: 'ColourPicker', group: 'Pickers' },
  { id: 'emoji-icon-picker', label: 'EmojiIconPicker', group: 'Pickers' },
  { id: 'category-tree', label: 'CategoryTree', group: 'Category Components' },
  { id: 'toast', label: 'Toast', group: 'Feedback & overlay' },
  { id: 'confirmation-dialog', label: 'ConfirmationDialog', group: 'Feedback & overlay' },
  { id: 'modal', label: 'Modal', group: 'Feedback & overlay' },
  { id: 'context-menu', label: 'ContextMenu', group: 'Feedback & overlay' },
  { id: 'empty-state', label: 'EmptyState', group: 'States' },
  { id: 'alert-banner', label: 'AlertBanner', group: 'States' },
  // Public & error (bible §3) — the shared PublicPage shell. Not a primitives-barrel export, so it has
  // no PRIMITIVE_DEMO_SECTION entry; the completeness guard's real-component marker covers it.
  { id: 'public-page', label: 'PublicPage', group: 'Public & error' },
]

// Maps every primitive exported from components/primitives/index.ts to the section that demos it.
// Toast is demoed via the #toast pushToast buttons rendered by the real ToastContainer (the 1.8b
// pattern); Icon lives under the Foundation #icon section. The completeness guard requires an entry
// here for every barrel export and rejects stale entries.
export const PRIMITIVE_DEMO_SECTION: Record<string, string> = {
  Button: 'button',
  Input: 'input',
  Label: 'label',
  Checkbox: 'checkbox',
  Toggle: 'toggle',
  Dropdown: 'dropdown',
  DatePicker: 'date-picker',
  MonetaryValueInput: 'monetary-value-input',
  MonetaryValue: 'value-atoms',
  DateValue: 'value-atoms',
  NumberValue: 'value-atoms',
  ThemePicker: 'theme-picker',
  ColourPicker: 'colour-picker',
  EmojiIconPicker: 'emoji-icon-picker',
  SegmentedControl: 'segmented-control',
  Icon: 'icon',
  Badge: 'badge',
  Dot: 'dot',
  Avatar: 'avatar',
  Card: 'card',
  Divider: 'divider',
  Spinner: 'spinner',
  Skeleton: 'skeleton',
  ProgressBar: 'progress-bar',
  MiniSparkline: 'mini-sparkline',
  FavouriteStar: 'favourite-star',
  Tooltip: 'tooltip',
  ContextMenu: 'context-menu',
  Modal: 'modal',
  Toast: 'toast',
  EmptyState: 'empty-state',
  AlertBanner: 'alert-banner',
  ConfirmationDialog: 'confirmation-dialog',
  Zone: 'zone',
  // Table + its column-vocabulary factories are all demoed in the one #table section (TableDemo).
  Table: 'table',
  dateColumn: 'table',
  textColumn: 'table',
  moneyColumn: 'table',
  selectColumn: 'table',
  actionsColumn: 'table',
  // FilterBar + its serializer are demoed in the one #filterbar section (FilterBarDemo).
  FilterBar: 'filterbar',
  serializeToVisualizationFilter: 'filterbar',
}
