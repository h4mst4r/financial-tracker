import { useEffect, useRef, ReactNode } from 'react';
import { Icon } from './Icon';
import { X } from 'lucide-react';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  size?: 'md' | 'lg';
  children: ReactNode;
}

const sizeClasses = {
  md: 'w-drawer-sm',
  lg: 'w-drawer-md',
};

export const Drawer = ({
  isOpen,
  onClose,
  title,
  size = 'md',
  children,
}: DrawerProps) => {
  const drawerRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  // Focus management
  useEffect(() => {
    if (isOpen) {
      previousFocus.current = document.activeElement as HTMLElement;
      const timer = setTimeout(() => {
        drawerRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    } else {
      previousFocus.current?.focus();
    }
  }, [isOpen]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const drawer = drawerRef.current;
      if (!drawer) return;

      const focusable = drawer.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleTabKey);
    return () => window.removeEventListener('keydown', handleTabKey);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-modal" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div
        ref={drawerRef}
        tabIndex={-1}
        className={`absolute right-0 top-0 h-full bg-surface border-l border-border shadow-xl flex flex-col ${sizeClasses[size]} transition-transform duration-slow ease-out translate-x-0`}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
            <h2 className="text-lg font-semibold text-text">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-text-muted hover:text-text transition-colors"
              aria-label="Close"
            >
              <Icon icon={X} size="md" />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
};
