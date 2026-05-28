import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Wallet,
  Landmark,
  Car,
  Shield,
  Receipt,
  Repeat,
  ArrowLeftRight,
  PieChart,
  Tags,
  Settings,
  Bell,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import type { LucideIcon } from 'lucide-react';

// --- Navigation Section Definitions ---

interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  shortcut?: number; // Keyboard shortcut (1-9)
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

const navigationSections: NavSection[] = [
  {
    label: 'Main',
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, shortcut: 1 },
    ],
  },
  {
    label: 'Accounts',
    items: [
      { label: 'Accounts', path: '/accounts', icon: Wallet, shortcut: 2 },
      { label: 'Capital', path: '/capital', icon: Landmark, shortcut: 3 },
      { label: 'Assets', path: '/assets', icon: Car, shortcut: 4 },
      { label: 'Insurance', path: '/insurance', icon: Shield, shortcut: 5 },
    ],
  },
  {
    label: 'Planning',
    items: [
      { label: 'Transactions', path: '/transactions', icon: Receipt, shortcut: 6 },
      { label: 'Recurring', path: '/recurring-payments', icon: Repeat, shortcut: 7 },
      { label: 'Transfers', path: '/transfers', icon: ArrowLeftRight, shortcut: 8 },
      { label: 'Budgets', path: '/budgets', icon: PieChart, shortcut: 9 },
    ],
  },
];

const bottomNavItems: NavItem[] = [
  { label: 'Categories', path: '/categories', icon: Tags },
  { label: 'Settings', path: '/settings', icon: Settings },
  { label: 'Alerts', path: '/alerts', icon: Bell },
];

// --- Sidebar Props ---

interface SidebarProps {
  collapsed?: boolean; // true = icon-only mode (768-1024px)
}

export const Sidebar: React.FC<SidebarProps> = ({ collapsed = false }) => {
  const location = useLocation();
  const currentPerson = useAuthStore((state) => state.currentPerson);
  const [viewMode, setViewMode] = useState<'household' | 'personal'>(
    currentPerson?.defaultView ?? 'household'
  );

  const toggleView = (): void => {
    setViewMode((prev) => (prev === 'household' ? 'personal' : 'household'));
  };

  return (
    <aside
      className={`flex flex-col bg-surface border-r border-border transition-all duration-200 ease-default ${
        collapsed ? 'w-16 min-w-16' : 'w-64 min-w-64'
      }`}
    >
      {/* Logo / Brand */}
      <div className={`flex items-center h-16 border-b border-border ${collapsed ? 'justify-center px-2' : 'px-4'}`}>
        {!collapsed && (
          <span className="text-lg font-bold text-text-primary tracking-tight">
            FinTrack
          </span>
        )}
        {collapsed && (
          <span className="text-lg font-bold text-primary">F</span>
        )}
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 scrollbar-thin">
        {navigationSections.map((section) => (
          <div key={section.label} className="mb-4">
            {!collapsed && section.label && (
              <div className="px-4 mb-2">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  {section.label}
                </span>
              </div>
            )}
            <ul className="space-y-0.5 px-2">
              {section.items.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    end={item.path !== '/dashboard'}
                    className={({ isActive }) => {
                      const base = 'flex items-center rounded-md transition-colors duration-fast';
                      const padding = collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2';
                      const activeClass = isActive
                        ? 'bg-accent-subtle text-primary'
                        : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary';
                      return `${base} ${padding} ${activeClass}`;
                    }}
                  >
                    <item.icon size={20} className={collapsed ? '' : 'mr-3 flex-shrink-0'} />
                    {!collapsed && (
                      <span className="text-sm font-medium truncate">{item.label}</span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom Section */}
      <div className="border-t border-border py-4">
        {/* Bottom Nav Items */}
        <ul className="space-y-0.5 px-2 mb-4">
          {bottomNavItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) => {
                  const base = 'flex items-center rounded-md transition-colors duration-fast';
                  const padding = collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2';
                  const activeClass = isActive
                    ? 'bg-accent-subtle text-primary'
                    : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary';
                  return `${base} ${padding} ${activeClass}`;
                }}
              >
                <item.icon size={20} className={collapsed ? '' : 'mr-3 flex-shrink-0'} />
                {!collapsed && (
                  <span className="text-sm font-medium truncate">{item.label}</span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>

        {/* View Toggle */}
        <div className="px-2">
          <button
            type="button"
            onClick={toggleView}
            className={`w-full flex items-center rounded-md border border-border bg-surface-hover hover:bg-surface-active transition-colors duration-fast ${
              collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2'
            }`}
            title={`Switch to ${viewMode === 'household' ? 'Personal' : 'Household'} view`}
          >
            <ArrowLeftRight size={16} className={collapsed ? '' : 'mr-3 text-text-secondary'} />
            {!collapsed && (
              <span className="text-xs font-medium text-text-secondary">
                {viewMode === 'household' ? 'Household' : 'My Finances'}
              </span>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
