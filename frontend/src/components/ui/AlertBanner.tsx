import { Icon } from './Icon';
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';

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

const variantColors = {
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
  info: 'text-info',
};

const variantBorders = {
  success: 'border-l-success',
  warning: 'border-l-warning',
  error: 'border-l-error',
  info: 'border-l-info',
};

export const AlertBanner = ({
  variant,
  title,
  message,
  onDismiss,
}: AlertBannerProps) => {
  const IconComponent = variantIcons[variant];

  return (
    <div
      className={`w-full bg-surface border border-border border-l-4 ${variantBorders[variant]} rounded-lg p-4 flex items-start gap-3`}
      role="alert"
    >
      <Icon
        icon={IconComponent}
        size="md"
        className={`${variantColors[variant]} shrink-0 mt-0.5`}
      />
      <div className="flex-1 min-w-0">
        {title && (
          <span className="font-medium text-text block mb-0.5">{title}</span>
        )}
        <span className="text-text-secondary text-sm">{message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-text-muted hover:text-text transition-colors shrink-0"
          aria-label="Dismiss"
        >
          <Icon icon={XCircle} size="sm" />
        </button>
      )}
    </div>
  );
};
