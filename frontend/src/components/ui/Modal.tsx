import { useEffect, useRef, ReactNode, useCallback } from 'react';
import { Icon } from './Icon';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  size?: 'sm' | 'md' | 'lg' | 'fullscreen';
  isDirty?: boolean;
  children: ReactNode;
}

const sizeClasses = {
  sm: 'max-w-dialog-sm',
  md: 'max-w-dialog-md',
  lg: 'max-w-dialog-lg',
  fullscreen: 'max-w-none w-full h-full rounded-none',
};

export const Modal = ({
  isOpen,
  onClose,
  title,
  size = 'md',
  isDirty = false,
  children,
}: ModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  const handleClose = useCallback(() => {
    if (isDirty) {
      const confirmClose = window.confirm(
        'You have unsaved changes. Are you sure you want to close?'
      );
      if (!confirmClose) return;
    }
    onClose();
  }, [isDirty, onClose]);

  // Focus management
  useEffect(() => {
    if (isOpen) {
      previousFocus.current = document.activeElement as HTMLElement;
      // Focus the dialog after render
      const timer = setTimeout(() => {
        dialogRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    } else {
      // Return focus on close
      previousFocus.current?.focus();
    }
  }, [isOpen]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  // Focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusable = dialog.querySelectorAll(
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
    <div
      className="fixed inset-0 z-modal flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal Panel */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`relative z-modal bg-surface-overlay rounded-xl shadow-xl border border-border flex flex-col ${
          size === 'fullscreen'
            ? 'w-full h-full'
            : `${sizeClasses[size]} w-full max-h-modal`
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h2 id="modal-title" className="text-lg font-semibold text-text">
            {title}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-text-muted hover:text-text transition-colors"
            aria-label="Close"
          >
            <Icon icon={X} size="md" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">{children}</div>
      </div>
    </div>
  );
};
