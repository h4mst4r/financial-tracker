import { useState, useRef, useEffect, type ReactNode, useCallback, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useFloatingPosition } from '../../hooks/useFloatingPosition';
import { Icon } from './Icon';
import { MoreVertical } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type ContextMenuItem =
  | { divider: true }
  | { header: true; displayName: string; email: string }
  | { divider?: boolean; label: string; icon?: LucideIcon; onClick: () => void; disabled?: boolean; destructive?: boolean };

interface ContextMenuProps {
  items: ContextMenuItem[];
  trigger?: ReactNode;
}

export const ContextMenu = ({ items, trigger }: ContextMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuAlign, setMenuAlign] = useState<'left' | 'right'>('right');
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement>(null);
  // Clamp panel horizontally so it never overflows the viewport
  const panelPos = useFloatingPosition(triggerRef, isOpen, { panelMinWidth: 180, viewportPadding: 32 });

  // Click outside handler
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleItemClick = (onClick: () => void, disabled?: boolean) => {
    if (disabled) return;
    onClick();
    setIsOpen(false);
  };

  const handleToggle = useCallback(() => {
    if (!isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuAlign(rect.left > window.innerWidth / 2 ? 'left' : 'right');
    }
    setIsOpen((prev) => !prev);
  }, [isOpen]);

  // Extract header item (always first, non-interactive — not part of divider logic)
  const headerItem = items.find((i): i is { header: true; displayName: string; email: string } =>
    'header' in i && (i as { header: boolean }).header === true
  );
  const itemsWithoutHeader = items.filter(i => !('header' in i && (i as { header: boolean }).header === true));

  // Strip leading, trailing, and consecutive dividers so callers
  // don't need to guard every conditional section.
  const visibleItems = itemsWithoutHeader.reduce<ContextMenuItem[]>((acc, item, idx) => {
    const isDivider = 'divider' in item && item.divider;
    if (!isDivider) return [...acc, item];
    // Skip if nothing has been added yet (leading divider)
    if (acc.length === 0) return acc;
    // Skip if previous item was also a divider (consecutive)
    const prev = acc[acc.length - 1];
    if ('divider' in prev && prev.divider) return acc;
    // Skip if no non-divider items follow (trailing divider)
    const hasItemAfter = itemsWithoutHeader.slice(idx + 1).some(i => !('divider' in i && i.divider));
    if (!hasItemAfter) return acc;
    return [...acc, item];
  }, []);

  return (
    <div className="relative">
      {/* Trigger — custom element uses span wrapper (avoids button-in-button);
          default ⋮ icon uses its own button with hover styles */}
      {trigger ? (
        <span
          ref={triggerRef as RefObject<HTMLSpanElement>}
          onClick={handleToggle}
          aria-haspopup="true"
          aria-expanded={isOpen}
          className="inline-block"
        >
          {trigger}
        </span>
      ) : (
        <button
          ref={triggerRef as RefObject<HTMLButtonElement>}
          type="button"
          onClick={handleToggle}
          className="p-1 rounded hover:bg-surface-hover transition-colors"
          aria-haspopup="true"
          aria-expanded={isOpen}
        >
          <Icon icon={MoreVertical} size="md" />
        </button>
      )}

      {/* Menu Panel — rendered via portal to escape parent stacking context */}
      {isOpen && panelPos && createPortal(
        <div
          ref={menuRef}
          className="fixed z-dropdown"
          style={{ top: panelPos.top, left: panelPos.left }}
        >
          <div
            className={`min-w-context-menu bg-surface-overlay border border-border rounded-lg shadow-xl py-1 ${menuAlign === 'left' ? 'left-0' : 'right-0'}`}
            role="menu"
          >
          {headerItem && (
            <>
              <div className="px-3 py-2">
                <div className="text-sm font-medium text-text-primary truncate">{headerItem.displayName}</div>
                <div className="text-xs text-text-secondary truncate">{headerItem.email}</div>
              </div>
              <div className="border-t border-border my-1" />
            </>
          )}
          {visibleItems.map((item, index) => (
            <div key={index}>
              {'divider' in item && item.divider && (
                <div className="my-1 border-t border-border" />
              )}
              {'label' in item && (
                <button
                  type="button"
                  role="menuitem"
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                    item.disabled
                      ? 'opacity-50 cursor-not-allowed'
                      : 'cursor-pointer hover:bg-surface-hover'
                  } ${item.destructive ? 'text-error' : 'text-text'}`}
                  onClick={() => handleItemClick(item.onClick, item.disabled)}
                  disabled={item.disabled}
                >
                  {item.icon && (
                    <Icon icon={item.icon} size="sm" className="shrink-0" />
                  )}
                  <span>{item.label}</span>
                </button>
              )}
            </div>
          ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
