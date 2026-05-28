import React, { useState } from 'react';
import { Eye, EyeOff, Search, X, AlertCircle } from 'lucide-react';

const variantMap = {
	text: '',
	number: 'text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
	search: 'pl-9 pr-9',
	password: 'pr-9',
} as const;

export type InputVariant = keyof typeof variantMap;

interface InputOwnProps {
	variant?: InputVariant;
	error?: string;
	disabled?: boolean;
	readOnly?: boolean;
	leading?: React.ReactNode;
	trailing?: React.ReactNode;
	className?: string;
}

export type InputProps = InputOwnProps &
	Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>;

export const Input: React.FC<InputProps> = ({
	variant = 'text',
	error,
	disabled,
	readOnly,
	leading,
	trailing,
	className = '',
	...rest
}) => {
	const [showPassword, setShowPassword] = useState(false);

	const paddingClasses = (() => {
		if (variant === 'search' || variant === 'password') return '';
		const left = leading ? 'pl-9' : 'pl-3';
		const right = (trailing || (error && variant !== 'password')) ? 'pr-9' : 'pr-3';
		return `${left} ${right}`;
	})();

	const baseClasses = `
		w-full h-10 rounded-md text-sm
		bg-surface-raised border border-border text-text-primary
		placeholder:text-text-muted
		transition-colors duration-150
		${paddingClasses}
	`;

	const variantClasses = variantMap[variant];

	const stateClasses = (() => {
		if (disabled) return 'opacity-50 cursor-not-allowed bg-surface';
		if (readOnly) return 'bg-transparent border-dashed focus:ring-0 focus:border-border';
		if (error) return 'border-error focus:ring-2 focus:ring-error/20 focus:border-error';
		return 'hover:border-border-light focus:ring-2 focus:ring-accent/20 focus:border-accent';
	})();

	const inputType = variant === 'password' ? (showPassword ? 'text' : 'password') : variant === 'number' ? 'number' : 'text';

	return (
		<div className="relative w-full">
			<div className="relative">
				{variant === 'search' && (
					<div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
						<Search size={16} aria-hidden="true" />
					</div>
				)}
				{leading && variant !== 'search' && (
					<div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
						{leading}
					</div>
				)}
				<input
					type={inputType}
					className={`${baseClasses} ${variantClasses} ${stateClasses} ${className}`}
					disabled={disabled}
					readOnly={readOnly}
					aria-invalid={!!error}
					aria-describedby={error ? `${rest.id}-error` : undefined}
					{...rest}
				/>
				{variant === 'search' && rest.value && (rest.value as string).length > 0 && (
					<button
						type="button"
						className="absolute right-8 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
						onClick={() => {
							if (rest.onChange) {
								const nativeEvent = {
									target: { value: '' },
								} as React.ChangeEvent<HTMLInputElement>;
								rest.onChange(nativeEvent);
							}
						}}
						aria-label="Clear search"
					>
						<X size={16} />
					</button>
				)}
				{variant === 'password' && (
					<button
						type="button"
						className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
						onClick={() => setShowPassword((prev) => !prev)}
						aria-label={showPassword ? 'Hide password' : 'Show password'}
					>
						{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
					</button>
				)}
				{trailing && variant !== 'password' && (
					<div className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
						{trailing}
					</div>
				)}
				{error && variant !== 'password' && (
					<div className="absolute right-3 top-1/2 -translate-y-1/2 text-error pointer-events-none">
						<AlertCircle size={16} aria-hidden="true" />
					</div>
				)}
			</div>
			{error && (
				<p id={`${rest.id}-error`} className="mt-1 text-xs text-error flex items-center gap-1">
					<AlertCircle size={12} aria-hidden="true" />
					{error}
				</p>
			)}
		</div>
	);
};
