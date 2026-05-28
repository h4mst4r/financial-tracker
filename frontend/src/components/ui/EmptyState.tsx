import { ReactNode } from 'react';
import { Icon } from './Icon';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: typeof Icon extends { render: (props: infer P) => any } ? P : never;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  isFiltered?: boolean;
}

export const EmptyState = ({
  icon: IconComponent,
  title,
  description,
  actionLabel,
  onAction,
  isFiltered = false,
}: EmptyStateProps) => {
  return (
    <div className="w-full flex flex-col items-center justify-center text-center py-12 px-4">
      {IconComponent && (
        <IconComponent size={48} className="text-text-muted mb-4" />
      )}
      <h3 className="text-lg font-semibold text-text-primary mb-1 w-full">{title}</h3>
      {description && (
        <p className="text-text-secondary mb-4 max-w-content w-full">{description}</p>
      )}
      {isFiltered ? (
        onAction && actionLabel && (
          <button
            type="button"
            className="text-primary hover:underline text-sm font-medium"
            onClick={onAction}
          >
            {actionLabel}
          </button>
        )
      ) : (
        actionLabel && onAction && (
          <Button variant="primary" onClick={onAction}>
            {actionLabel}
          </Button>
        )
      )}
    </div>
  );
};
