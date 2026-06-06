import React from 'react';
import { X } from 'lucide-react';

const variantMap = {
	success: 'bg-success-muted text-success',
	warning: 'bg-warning-muted text-warning',
	error: 'bg-error-muted text-error',
	info: 'bg-info-muted text-info',
	neutral: 'bg-surface-hover text-text-secondary',
	entity: '',
} as const;

export type BadgeVariant = keyof typeof variantMap;

interface BadgeProps {
	variant?: BadgeVariant;
	entityAccent?: string;
	dismissible?: boolean;
	onDismiss?: () => void;
	onClick?: (e: React.MouseEvent<HTMLSpanElement>) => void;
	children: React.ReactNode;
	className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
	variant = 'neutral',
	entityAccent,
	dismissible = false,
	onDismiss,
	onClick,
	children,
	className = '',
}) => {
	const baseClasses =
		'inline-flex items-center rounded-full h-5 px-2 text-xs font-medium gap-1';

	const variantClasses = variantMap[variant];

	// Entity variant: set --entity-accent CSS var; bg-entity-accent-muted and
	// text-entity-accent utilities read it — no magic hex opacity needed.
	const entityStyle: React.CSSProperties | undefined =
		variant === 'entity' && entityAccent
			? ({ '--entity-accent': entityAccent } as React.CSSProperties)
			: undefined;

	const entityClasses =
		variant === 'entity' && entityAccent
			? 'bg-entity-accent-muted text-entity-accent'
			: '';

	return (
		<span className={`${baseClasses} ${variantClasses} ${entityClasses} ${className}`} style={entityStyle} onClick={onClick}>
			{children}
			{dismissible && (
				<span
					role="button"
					tabIndex={-1}
					aria-label="Dismiss"
					className="ml-0.5 hover:text-error transition-colors cursor-pointer"
					onClick={(e) => {
						e.stopPropagation();
						onDismiss?.();
					}}
				>
					<X size={12} aria-hidden="true" />
				</span>
			)}
		</span>
	);
};
