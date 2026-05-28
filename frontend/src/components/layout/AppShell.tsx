import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

// --- Page Title Map ---

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/accounts': 'Accounts',
  '/capital': 'Capital',
  '/assets': 'Assets',
  '/insurance': 'Insurance',
  '/transactions': 'Transactions',
  '/recurring-payments': 'Recurring Payments',
  '/transfers': 'Transfers',
  '/budgets': 'Budgets',
  '/categories': 'Categories',
  '/settings': 'Settings',
  '/alerts': 'Alerts',
};

// --- AppShell Props ---

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  // Responsive sidebar detection
  useEffect(() => {
    const handleResize = (): void => {
      const width = window.innerWidth;
      // 768px ≤ width < 1024px → collapsed (icon-only)
      setSidebarCollapsed(width >= 768 && width < 1024);
    };

    handleResize(); // Initial check
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Get page title from current path
  const pageTitle = pageTitles[location.pathname] ?? 'Financial Tracker';

  // Close filter drawer on route change
  useEffect(() => {
    setFilterDrawerOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-screen bg-bg overflow-hidden">
      {/* Sidebar — hidden on mobile (<768px), shown as full/collapsed on larger screens */}
      <div className="hidden md:block flex-shrink-0">
        <Sidebar collapsed={sidebarCollapsed} />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <Topbar
          pageTitle={pageTitle}
          filterDrawerOpen={filterDrawerOpen}
          onToggleFilterDrawer={() => setFilterDrawerOpen((prev) => !prev)}
        />

        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-bg">
          {children}
        </main>

        {/* Bottom Navigation — mobile only (<768px) */}
        <nav className="md:hidden flex items-center justify-around h-14 bg-surface border-t border-border px-2">
          <BottomNavItem to="/dashboard" label="Home" icon="🏠" />
          <BottomNavItem to="/accounts" label="Accounts" icon="💰" />
          <BottomNavItem to="/transactions" label="Txns" icon="📄" />
          <BottomNavItem to="/budgets" label="Budgets" icon="📊" />
          <BottomNavItem to="/settings" label="Settings" icon="⚙️" />
        </nav>
      </div>
    </div>
  );
};

// --- Bottom Nav Item (Mobile) ---

interface BottomNavItemProps {
  to: string;
  label: string;
  icon: string;
}

const BottomNavItem: React.FC<BottomNavItemProps> = ({ to, label, icon }) => {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <a
      href={to}
      className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-md transition-colors duration-fast min-w-0 ${
        isActive
          ? 'text-primary'
          : 'text-text-muted hover:text-text-secondary'
      }`}
    >
      <span className="text-lg leading-none">{icon}</span>
      <span className="text-3xs font-medium truncate">{label}</span>
    </a>
  );
};

export default AppShell;
