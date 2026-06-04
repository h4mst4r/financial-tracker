import { Modal } from './Modal';
import { Button } from './Button';
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
      size="xs"
    >
      <div className="flex flex-col items-start gap-4">
        {/* Icon + Title */}
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-full bg-surface-hover ${config.iconColor}`}>
            <Icon icon={config.icon} size="lg" />
          </div>
          <div className="flex-1">
            <h2 id="modal-title" className="text-lg font-semibold text-text">{title}</h2>
            {message && (
              <p className="text-sm text-text-secondary mt-1">{message}</p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 w-full pt-4 border-t border-border">
          <Button
            variant="ghost"
            onClick={onClose}
          >
            {cancelLabel}
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            disabled={isConfirming}
            loading={isConfirming}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
