import { useEffect, useRef } from 'react';
import { Icon } from './Icon';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { useAlertStore } from '../../store/alertStore';
import type { Toast } from '../../store/alertStore';

interface ToastContainerProps {
  maxToasts?: number;
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

const ToastItem = ({ toast }: { toast: Toast }) => {
  const dismiss = useAlertStore((state) => state.dismiss);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      dismiss(toast.id);
    }, toast.duration ?? 4000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id, toast.duration, dismiss]);

  const IconComponent = variantIcons[toast.variant];

  return (
    <div
      className="flex items-start gap-3 bg-surface border border-border rounded-lg shadow-xl p-4 min-w-toast max-w-toast animate-slide-in"
      role="alert"
    >
      <Icon
        icon={IconComponent}
        size="md"
        className={`${variantColors[toast.variant]} shrink-0 mt-0.5`}
      />
      <div className="flex-1 min-w-0">
        {toast.title && (
          <span className="font-medium text-text block mb-0.5">{toast.title}</span>
        )}
        {toast.message && (
          <span className="text-text-secondary text-sm">{toast.message}</span>
        )}
      </div>
      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        className="text-text-muted hover:text-text transition-colors shrink-0"
        aria-label="Dismiss"
      >
        <Icon icon={X} size="xs" />
      </button>
    </div>
  );
};

export const ToastContainer = ({ maxToasts = 3 }: ToastContainerProps) => {
  const toasts = useAlertStore((state) => state.toasts);

  const visibleToasts = toasts.slice(-maxToasts).reverse();

  return (
    <div className="fixed top-4 right-4 z-toast flex flex-col gap-2 pointer-events-none">
      {visibleToasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} />
        </div>
      ))}
    </div>
  );
};
