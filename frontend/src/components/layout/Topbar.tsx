import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell as BellIcon, SlidersHorizontal, X, Settings as SettingsIcon, LogOut } from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu';
import { useAlertStore } from '../../store/alertStore';
import { useAuthStore } from '../../store/authStore';
import { useAuth } from '../../hooks/useAuth';

// --- Topbar Props ---

interface TopbarProps {
  pageTitle: string;
  /** Optional filter slot — rendered as a horizontal scrollable bar */
  filterSlot?: React.ReactNode;
  /** Whether the filter drawer is open (for <480px screens) */
  filterDrawerOpen?: boolean;
  /** Toggle the filter drawer */
  onToggleFilterDrawer?: () => void;
  /** Clear all filters callback */
  onClearFilters?: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  pageTitle,
  filterSlot,
  filterDrawerOpen = false,
  onToggleFilterDrawer,
  onClearFilters,
}) => {
  const currentPerson = useAuthStore((state) => state.currentPerson);
  const toasts = useAlertStore((state) => state.toasts);
  const unreadCount = toasts.filter((t) => t.variant === 'error' || t.variant === 'warning').length;
  const { logout } = useAuth();
  const navigate = useNavigate();

  const accountMenuItems: ContextMenuItem[] = [
    { header: true, displayName: currentPerson?.displayName ?? '', email: currentPerson?.email ?? '' },
    { label: 'Settings', icon: SettingsIcon, onClick: () => navigate('/settings') },
    { divider: true },
    { label: 'Log out', icon: LogOut, onClick: logout, destructive: true },
  ];

  return (
    <header className="sticky top-0 z-sticky flex items-center h-16 bg-surface border-b border-border px-4 gap-4">
      {/* Page Title */}
      <h1 className="text-lg font-semibold text-text-primary flex-shrink-0">
        {pageTitle}
      </h1>

      {/* Filter Slot — horizontal scroll on overflow */}
      <div className="flex-1 min-w-0">
        {/* Desktop: inline filter slot with horizontal scroll — visible ≥--breakpoint-xs per spec [G-14] */}
        <div className="hidden xs:flex items-center gap-2 overflow-x-auto scrollbar-thin">
          {filterSlot}
          {filterSlot && onClearFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClearFilters}
              className="flex items-center gap-1 text-xs flex-shrink-0"
            >
              <X size={12} />
              Clear all
            </Button>
          )}
        </div>

        {/* Mobile: "Filters" button — visible <--breakpoint-xs per spec [G-14] */}
        {filterSlot && (
          <div className="max-xs:block hidden">
            <Tooltip content="Open filters">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onToggleFilterDrawer}
                className="flex items-center gap-1.5"
              >
                <SlidersHorizontal size={14} />
                Filters
                {unreadCount > 0 && (
                  <Badge variant="neutral" className="ml-1">
                    {unreadCount}
                  </Badge>
                )}
              </Button>
            </Tooltip>

            {/* Full-screen filter drawer */}
            {filterDrawerOpen && (
              <div className="fixed inset-0 top-16 z-modal bg-bg/95 backdrop-blur-sm p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-text-primary">Filters</h2>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onToggleFilterDrawer}
                    aria-label="Close filters"
                  >
                    <X size={18} />
                  </Button>
                </div>
                <div className="flex flex-col gap-4">
                  {filterSlot}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Alert Bell */}
        <Tooltip content="Alerts">
          <Link
            to="/alerts"
            aria-label="Alerts"
            className="relative flex items-center p-2 rounded-md text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors duration-fast"
          >
            <BellIcon size={20} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-error rounded-full" />
            )}
          </Link>
        </Tooltip>

        {/* User Avatar — opens account menu */}
        <ContextMenu
          items={accountMenuItems}
          trigger={
            <button
              type="button"
              className="flex items-center gap-2 p-1.5 rounded-md hover:bg-surface-hover transition-colors duration-fast"
              aria-label="User account menu"
            >
              <Avatar
                name={currentPerson?.displayName}
                pictureUrl={currentPerson?.pictureUrl ?? undefined}
                size="sm"
              />
              <span className="hidden lg:block text-sm font-medium text-text-primary max-w-avatar-name truncate">
                {currentPerson?.displayName ?? 'User'}
              </span>
            </button>
          }
        />
      </div>
    </header>
  );
};

export default Topbar;
