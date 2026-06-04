import React, { useRef, useEffect } from 'react';
import { Check } from 'lucide-react';

interface CheckboxOwnProps {
	checked?: boolean;
	indeterminate?: boolean;
	disabled?: boolean;
	onChange?: (checked: boolean) => void;
	label?: string;
	className?: string;
}

export type CheckboxProps = CheckboxOwnProps &
	Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'>;

export const Checkbox: React.FC<CheckboxProps> = ({
	checked = false,
	indeterminate = false,
	disabled = false,
	onChange,
	label,
	className = '',
	children,
	...rest
}) => {
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (inputRef.current) inputRef.current.indeterminate = indeterminate;
	}, [indeterminate]);

	const handleClick = () => {
		if (disabled) return;
		onChange?.(!checked);
	};

	return (
		<div
			role="checkbox"
			aria-checked={indeterminate ? 'mixed' : checked}
			aria-disabled={disabled}
			tabIndex={disabled ? -1 : 0}
			onClick={handleClick}
			onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); handleClick(); } }}
			className={`inline-flex items-start gap-2 cursor-pointer select-none ${disabled ? 'cursor-not-allowed opacity-50' : ''} ${className}`}
			{...rest}
		>
			<div
				className={`
					shrink-0 w-4 h-4 mt-0.5 rounded border flex items-center justify-center
					transition-colors duration-150
					${indeterminate ? 'bg-primary border-primary' : checked ? 'bg-primary border-primary' : 'bg-transparent border-border'}
					${disabled ? '' : 'hover:border-primary'}
				`}
			>
				{indeterminate && (
					<div className="w-2 h-0.5 bg-text-inverse rounded" />
				)}
				{checked && !indeterminate && (
					<Check size={12} className="text-text-inverse" strokeWidth={3} />
				)}
			</div>
			{/* Hidden native input for form compat */}
			<input
				ref={inputRef}
				type="checkbox"
				className="sr-only"
				checked={checked}
				disabled={disabled}
				onChange={() => {}}
				tabIndex={-1}
				aria-hidden="true"
			/>
			{(children || label) && (
				<span className="text-sm text-text-primary py-0.5">{children ?? label}</span>
			)}
		</div>
	);
};
