import {
  LayoutDashboard,
  Wallet,
  TrendingUp,
  House,
  Shield,
  ArrowLeftRight,
  Repeat,
  ArrowRightLeft,
  ChartPie,
  CreditCard,
  FolderTree,
  CircleDollarSign,
  Calculator,
  Settings,
  type LucideIcon,
} from 'lucide-react'

// Single source for the grouped sidebar nav (UX §1.1). Consumed by the expanded sidebar, the
// icon-rail, and the mobile bottom-sheet — none of them re-list modules (P4: no hardcoded duplication).
export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Accounts',
    items: [
      { label: 'Accounts', to: '/accounts', icon: Wallet },
      { label: 'Capital', to: '/capital', icon: TrendingUp },
      { label: 'Assets', to: '/assets', icon: House },
      { label: 'Insurance', to: '/insurance', icon: Shield },
    ],
  },
  {
    label: 'Activity',
    items: [
      { label: 'Transactions', to: '/transactions', icon: ArrowLeftRight },
      { label: 'Recurring', to: '/recurring', icon: Repeat },
      { label: 'Transfers', to: '/transfers', icon: ArrowRightLeft },
    ],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Budgets', to: '/budgets', icon: ChartPie },
      { label: 'Debt', to: '/debt', icon: CreditCard },
    ],
  },
  {
    label: 'Setup',
    items: [
      { label: 'Categories', to: '/categories', icon: FolderTree },
      { label: 'Currencies', to: '/currencies', icon: CircleDollarSign },
      { label: 'Formula', to: '/formula', icon: Calculator },
    ],
  },
]

// Settings is pinned at the sidebar bottom (UX §1.1), not part of a nav group.
export const SETTINGS_ITEM: NavItem = { label: 'Settings', to: '/settings', icon: Settings }
