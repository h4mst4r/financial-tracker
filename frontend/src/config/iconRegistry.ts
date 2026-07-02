import {
  // Row / menu actions
  Plus, Pencil, Copy, Archive, RotateCcw, ArchiveRestore, Trash2, Star, MoreVertical,
  ArrowUpDown, Search, Maximize2, GripVertical, ArrowUpToLine, FolderInput, Merge, X, Check,
  Tag, UserPlus, MailX, UserMinus, User, LogOut, Lock, ArrowUp, ArrowDown,
  // Control / furniture
  Menu, Calendar, SlidersHorizontal, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Minus,
  TrendingUp, TrendingDown,
  // Transaction flags (typed behavioural flags, ARCH §3.7 — not tags)
  UserRound, Receipt,
  // Semantic / status + error
  AlertTriangle, XCircle, Info, TriangleAlert,
  // Alert types
  CalendarX, Clock, CalendarClock, PlugZap, DatabaseBackup,
  type LucideIcon,
} from 'lucide-react'
import type { StatusTone } from './statusRegistry'
import { NAV_GROUPS, SETTINGS_ITEM } from '../components/shell/navigation'

// The authoritative icon registry (UX §11). A glyph is a LOOKUP, never a call-site pick — one library
// (lucide) behind the `Icon` wrapper, so a copyright/licensing swap is a single edit (L14). The other
// homes own their slice and are referenced, not duplicated: sidebar nav → shell/navigation.ts,
// account-type → config/accountIcons.ts, public/error → pages/public/publicPages.ts, category palette
// → config/categoryIcons.ts. This file owns row/menu actions, control furniture, semantic/status,
// alert types, and the empty/error glyphs.

/** Row / menu actions (UX §11) + the action extras the build uses. */
export const ACTION_ICON = {
  add: Plus,
  edit: Pencil,
  duplicate: Copy,
  archive: Archive,
  restore: RotateCcw,
  restoreMember: ArchiveRestore,
  delete: Trash2,
  favourite: Star,
  more: MoreVertical,
  sort: ArrowUpDown,
  search: Search,
  expand: Maximize2,
  drag: GripVertical,
  promote: ArrowUpToLine,
  moveTo: FolderInput,
  merge: Merge,
  close: X,
  select: Check,
  tag: Tag,
  invite: UserPlus,
  revokeInvite: MailX,
  removeMember: UserMinus,
  profile: User,
  signOut: LogOut,
  locked: Lock,
  roleUp: ArrowUp,
  roleDown: ArrowDown,
} as const satisfies Record<string, LucideIcon>

/** Transaction behavioural flags (UX §11/§751) — typed booleans that drive behaviour (debt / GST
 *  reporting), rendered as muted ledger `Icon`s. **Not tags** (ARCH §3.7); tags are colour `Badge`s. */
export const TRANSACTION_FLAG_ICON = {
  personal: UserRound,
  gst: Receipt,
} as const satisfies Record<string, LucideIcon>

/** Control / furniture — primitive UI affordances (chevrons, hamburger, calendar…), not domain choices. */
export const CONTROL_ICON = {
  menu: Menu,
  calendar: Calendar,
  filters: SlidersHorizontal,
  chevronUp: ChevronUp,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  leaf: Minus,
  trendUp: TrendingUp,
  trendDown: TrendingDown,
} as const satisfies Record<string, LucideIcon>

/** The §4 semantic tones → glyph (meaning via the icon, never colour alone). `neutral` carries no glyph. */
export const STATUS_ICON: Record<StatusTone, LucideIcon | null> = {
  positive: Check,
  warning: AlertTriangle,
  critical: XCircle,
  info: Info,
  neutral: null,
}

/** Alert types (`alert_type` → glyph; tone resolves via the §4 status registry). Consumers arrive in Epic 10. */
export const ALERT_ICON = {
  BUDGET_WARNING: AlertTriangle,
  BUDGET_EXCEEDED: AlertTriangle,
  RECURRING_MISSED: CalendarX,
  FX_RATE_STALE: Clock,
  UPCOMING_PAYMENTS: CalendarClock,
  FX_API_DOWN: PlugZap,
  BACKUP_CREATED: DatabaseBackup,
} as const satisfies Record<string, LucideIcon>

/** The glyph for an error data-surface (UX §11/§18). */
export const errorIcon: LucideIcon = TriangleAlert

// Module nav glyph by route (UX §11 "EmptyState icon = the surface's own module nav glyph"). Built
// from the single nav source so it can't drift from the sidebar.
const MODULE_NAV_ICON: Record<string, LucideIcon> = Object.fromEntries(
  [...NAV_GROUPS.flatMap((g) => g.items), SETTINGS_ITEM].map((item) => [item.to, item.icon]),
)

/** The module nav glyph for a route (e.g. `/accounts` → Wallet). Undefined for a non-module surface. */
export function moduleNavIcon(route: string): LucideIcon | undefined {
  return MODULE_NAV_ICON[route]
}
