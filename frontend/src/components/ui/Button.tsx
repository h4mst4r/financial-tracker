import React from 'react';
import { Spinner } from './Spinner';

const variantMap = {
	primary:
		'bg-accent text-text-inverse hover:bg-accent-hover active:scale-press focus-visible:outline-2 focus-visible:outline-border-focus focus-visible:outline-offset-2',
	secondary:
		'bg-surface border-border text-text-primary hover:bg-surface-hover active:scale-press focus-visible:outline-2 focus-visible:outline-border-focus focus-visible:outline-offset-2',
	ghost:
		'text-text-secondary hover:bg-surface-hover active:scale-press focus-visible:outline-2 focus-visible:outline-border-focus focus-visible:outline-offset-2',
	danger:
		'bg-error-bg text-error border border-error/40 hover:bg-error/20 active:scale-press focus-visible:outline-2 focus-visible:outline-border-focus focus-visible:outline-offset-2',
	icon:
		'text-text-secondary hover:bg-surface-hover active:scale-press focus-visible:outline-2 focus-visible:outline-border-focus focus-visible:outline-offset-2',
} as const;

const sizeMap = {
	sm: 'h-8 px-3 text-sm gap-1.5',
	md: 'h-10 px-4 text-sm gap-2',
	lg: 'h-12 px-6 text-base gap-2.5',
} as const;

export type ButtonVariant = keyof typeof variantMap;
export type ButtonSize = keyof typeof sizeMap;

interface ButtonOwnProps {
	variant?: ButtonVariant;
	size?: ButtonSize;
	loading?: boolean;
	disabled?: boolean;
	onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
	className?: string;
	children: React.ReactNode;
	'aria-label'?: string;
}

export type ButtonProps = ButtonOwnProps &
	Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'size' | 'onClick'>;

export const Button: React.FC<ButtonProps> = ({
	variant = 'primary',
	size = 'md',
	loading = false,
	disabled = false,
	onClick,
	className = '',
	children,
	'aria-label': ariaLabel,
	...rest
}) => {
	const isIcon = variant === 'icon';
	const baseClasses = `
		inline-flex items-center justify-center font-medium rounded-md
		transition-colors duration-150
		touch-target md:min-h-10
		disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent
		focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
	`;

	const variantClasses = variantMap[variant];
	const sizeClasses = isIcon ? `p-2 ${size === 'sm' ? 'p-1.5' : size === 'lg' ? 'p-3' : ''}` : sizeMap[size];
	const disabledClass = disabled ? 'opacity-40 cursor-not-allowed' : '';

	return (
		<button
			type="button"
			className={`${baseClasses} ${variantClasses} ${sizeClasses} ${disabledClass} ${className}`}
			disabled={disabled || loading}
			onClick={(e) => {
				if (!disabled && !loading) onClick?.(e);
			}}
			aria-label={ariaLabel}
			aria-busy={loading}
			{...rest}
		>
			{loading && <Spinner size={size === 'sm' ? 'sm' : size === 'lg' ? 'md' : 'sm'} />}
			{children}
		</button>
	);
};
