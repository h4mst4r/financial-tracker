import { useEffect, useRef, useState, type ReactNode, useCallback } from 'react';
import { Icon } from './Icon';
import { X, AlertTriangle } from 'lucide-react';
import { Button } from './Button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'fullscreen';
  isDirty?: boolean;
  /** Override the built-in dirty-close guard. Return true to allow close, false to block. */
  onConfirmClose?: () => boolean;
  children: ReactNode;
}

const sizeClasses: Record<string, string> = {
  xs: 'max-w-dialog-xs',
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
  onConfirmClose,
  children,
}: ModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  // Inline dirty-close confirmation (replaces blocking window.confirm — E84)
  const [showDirtyGuard, setShowDirtyGuard] = useState(false);

  const handleClose = useCallback(() => {
    if (isDirty) {
      if (onConfirmClose) {
        if (!onConfirmClose()) return;
      } else {
        setShowDirtyGuard(true);
        return;
      }
    }
    onClose();
  }, [isDirty, onClose, onConfirmClose]);

  const handleConfirmDiscard = useCallback(() => {
    setShowDirtyGuard(false);
    onClose();
  }, [onClose]);

  const handleCancelDiscard = useCallback(() => {
    setShowDirtyGuard(false);
  }, []);

  // Reset dirty guard when modal closes
  useEffect(() => {
    if (!isOpen) setShowDirtyGuard(false);
  }, [isOpen]);

  // Focus management
  useEffect(() => {
    if (isOpen) {
      previousFocus.current = document.activeElement as HTMLElement;
      const timer = setTimeout(() => { dialogRef.current?.focus(); }, 0);
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
        if (showDirtyGuard) handleCancelDiscard();
        else handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose, handleCancelDiscard, showDirtyGuard]);

  // Focus trap
  useEffect(() => {
    if (!isOpen) return;
    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', handleTabKey);
    return () => window.removeEventListener('keydown', handleTabKey);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-modal flex items-end md:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-backdrop backdrop-blur-sm" onClick={handleClose} />

      {/* Modal Panel — bottom-sheet on mobile (E44), centered dialog on desktop */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`relative z-modal bg-surface-overlay shadow-xl border border-border flex flex-col focus:outline-none ${
          size === 'fullscreen'
            ? 'w-full h-full rounded-none'
            : `${sizeClasses[size]} w-full max-h-modal rounded-t-xl md:rounded-xl`
        }`}
      >
        {/* Inline dirty-close guard (E84) */}
        {showDirtyGuard && (
          <div className="shrink-0 mx-4 mt-4 p-3 bg-warning-muted border border-warning/30 rounded-lg flex items-start gap-3">
            <Icon icon={AlertTriangle} size="sm" className="text-warning shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary">Discard changes?</p>
              <p className="text-xs text-text-secondary mt-0.5">Your unsaved changes will be lost.</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="ghost" size="sm" onClick={handleCancelDiscard}>Keep editing</Button>
              <Button variant="danger" size="sm" onClick={handleConfirmDiscard}>Discard</Button>
            </div>
          </div>
        )}

        {/* Header — only rendered when a title is provided */}
        {title ? (
          <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
            <h2 id="modal-title" className="text-lg font-semibold text-text-primary">{title}</h2>
            <button
              type="button"
              onClick={handleClose}
              className="text-text-muted hover:text-text-primary transition-colors"
              aria-label="Close"
            >
              <Icon icon={X} size="md" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-3 right-3 text-text-muted hover:text-text-primary transition-colors z-10"
            aria-label="Close"
          >
            <Icon icon={X} size="md" />
          </button>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">{children}</div>
      </div>
    </div>
  );
};
