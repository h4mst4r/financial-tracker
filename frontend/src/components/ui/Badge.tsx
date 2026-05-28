import React from 'react';
import { X } from 'lucide-react';

const variantMap = {
	success: 'bg-success-bg text-success',
	warning: 'bg-warning-bg text-warning',
	error: 'bg-error-bg text-error',
	info: 'bg-info-bg text-info',
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

	const entityStyle: React.CSSProperties | undefined =
		variant === 'entity' && entityAccent
			? {
					backgroundColor: `${entityAccent}26`, // ~15% opacity in hex
					color: entityAccent,
				}
			: undefined;

	return (
		<span className={`${baseClasses} ${variantClasses} ${className}`} style={entityStyle} onClick={onClick}>
			{children}
			{dismissible && (
				<button
					type="button"
					className="ml-0.5 hover:text-error transition-colors"
					onClick={(e) => {
						e.stopPropagation();
						onDismiss?.();
					}}
					aria-label="Dismiss"
				>
					<X size={12} aria-hidden="true" />
				</button>
			)}
		</span>
	);
};
