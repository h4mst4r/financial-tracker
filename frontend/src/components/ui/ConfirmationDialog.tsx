import { Modal } from './Modal';
import { Icon } from './Icon';
import { AlertTriangle, AlertCircle } from 'lucide-react';

type ConfirmationVariant = 'warning' | 'danger';

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  variant?: ConfirmationVariant;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isConfirming?: boolean;
}

const variantConfig = {
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-warning',
  },
  danger: {
    icon: AlertCircle,
    iconColor: 'text-error',
  },
};

export const ConfirmationDialog = ({
  isOpen,
  onClose,
  onConfirm,
  variant = 'warning',
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isConfirming = false,
}: ConfirmationDialogProps) => {
  const config = variantConfig[variant];

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      size="sm"
    >
      <div className="flex flex-col items-start gap-4">
        {/* Icon + Title */}
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-full bg-surface-hover ${config.iconColor}`}>
            <Icon icon={config.icon} size="lg" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-text">{title}</h2>
            {message && (
              <p className="text-sm text-text-secondary mt-1">{message}</p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 w-full pt-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-border bg-surface hover:bg-surface-hover text-text transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isConfirming}
            className={`px-4 py-2 text-sm rounded-lg font-medium text-white transition-colors ${
              variant === 'danger'
                ? 'bg-error hover:bg-error-hover disabled:bg-error/50'
                : 'bg-warning hover:bg-warning-hover disabled:bg-warning/50'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
};
