import { useState, useRef, useEffect, ReactNode, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { MoreVertical } from 'lucide-react';

export interface ContextMenuItem {
  label: string;
  icon?: typeof Icon extends { render: (props: infer P) => any } ? P : never;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  divider?: boolean;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  trigger?: ReactNode;
}

export const ContextMenu = ({ items, trigger }: ContextMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuAlign, setMenuAlign] = useState<'left' | 'right'>('right');
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className="p-1 rounded hover:bg-surface-hover transition-colors"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        {trigger || <Icon icon={MoreVertical} size="md" />}
      </button>

      {/* Menu Panel — rendered via portal to escape parent stacking context */}
      {isOpen && createPortal(
        <div
          ref={menuRef}
          className="fixed z-dropdown"
          style={{
            left: triggerRef.current?.getBoundingClientRect().left,
            top: triggerRef.current?.getBoundingClientRect().bottom + 4,
          }}
        >
          <div
            className={`min-w-context-menu bg-surface border border-border rounded-lg shadow-xl py-1 ${menuAlign === 'left' ? 'left-0' : 'right-0'}`}
            role="menu"
          >
          {items.map((item, index) => (
            <div key={index}>
              {item.divider && (
                <div className="my-1 border-t border-border" />
              )}
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
            </div>
          ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
