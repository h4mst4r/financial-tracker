import { Icon } from './Icon';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

interface AlertBannerProps {
  variant: 'success' | 'warning' | 'error' | 'info';
  title?: string;
  message: string;
  onDismiss?: () => void;
}

const variantIcons = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
};

const variantStyles = {
  success: { text: 'text-success', border: 'border-l-success' },
  warning: { text: 'text-warning', border: 'border-l-warning' },
  error:   { text: 'text-error',   border: 'border-l-error'   },
  info:    { text: 'text-info',    border: 'border-l-info'    },
};

export const AlertBanner = ({
  variant,
  title,
  message,
  onDismiss,
}: AlertBannerProps) => {
  const IconComponent = variantIcons[variant];
  const { text, border } = variantStyles[variant];

  return (
    <div
      className={`w-full bg-surface border border-border border-l-4 ${border} rounded-lg p-4 flex items-start gap-3`}
      role="alert"
    >
      <Icon
        icon={IconComponent}
        size="md"
        className={`${text} shrink-0 mt-0.5`}
      />
      <div className="flex-1 min-w-0">
        {title && (
          <span className="font-medium text-text-primary block mb-0.5">{title}</span>
        )}
        <span className="text-text-secondary text-sm">{message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-text-muted hover:text-text-primary transition-colors shrink-0"
          aria-label="Dismiss"
        >
          <Icon icon={X} size="sm" />
        </button>
      )}
    </div>
  );
};
