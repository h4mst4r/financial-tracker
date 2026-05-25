/**
 * ConfirmationDialog — Simple confirmation modal with customizable action.
 *
 * Used for destructive actions, merges, seeding, and any operation requiring user confirmation.
 */
import { useState } from "react";
import { Modal } from "./Modal";

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  disabled?: boolean;
}

export function ConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  disabled = false,
}: ConfirmationDialogProps) {
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    if (disabled || confirming) return;
    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  };

  const handleClose = () => {
    setConfirming(false);
    onClose();
  };

  const variantClasses = {
    default: "btn-primary",
    destructive: "btn-danger",
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} size="sm">
      {/* Message */}
      <div className="mb-6 text-text-secondary">{message}</div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <button onClick={handleClose} className="btn-secondary" disabled={confirming}>
          {cancelLabel}
        </button>
        <button
          onClick={handleConfirm}
          className={variantClasses[variant]}
          disabled={disabled || confirming}
        >
          {confirming ? "Processing..." : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
