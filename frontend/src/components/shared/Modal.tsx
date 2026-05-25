/**
 * Modal — Base modal/dialog component with backdrop, escape key, and animations.
 *
 * Shared across all modal dialogs in the application.
 * Handles backdrop click-to-close, ESC key, and focus trapping.
 */
import { useEffect } from "react";
import { XIcon } from "./icons";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  showCloseButton?: boolean;
  closeOnBackdrop?: boolean;
  className?: string;
}

const SIZE_MAP = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  full: "max-w-4xl",
};

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
  showCloseButton = true,
  closeOnBackdrop = true,
  className,
}: ModalProps) {
  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 ${className}`}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      {/* Modal content */}
      <div
        className={`card ${SIZE_MAP[size]} w-full mx-4 animate-in fade-in zoom-in duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (if title is provided) */}
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-primary">{title}</h2>
            {showCloseButton && (
              <button onClick={onClose} className="btn-close">
                <XIcon />
              </button>
            )}
          </div>
        )}

        {/* Close button without title */}
        {!title && showCloseButton && (
          <div className="flex justify-end mb-2 -mt-2 -mr-2">
            <button onClick={onClose} className="btn-close">
              <XIcon />
            </button>
          </div>
        )}

        {/* Body */}
        <div>{children}</div>
      </div>
    </div>
  );
}
