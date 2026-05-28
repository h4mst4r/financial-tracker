import React from 'react';

interface ToggleOwnProps {
	checked?: boolean;
	disabled?: boolean;
	onChange?: (checked: boolean) => void;
	className?: string;
}

export type ToggleProps = ToggleOwnProps &
	Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'type'>;

export const Toggle: React.FC<ToggleProps> = ({
	checked = false,
	disabled = false,
	onChange,
	className = '',
	...rest
}) => {
	const handleClick = () => {
		if (!disabled) {
			onChange?.(!checked);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			handleClick();
		}
	};

	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-disabled={disabled}
			onClick={handleClick}
			onKeyDown={handleKeyDown}
			className={`
				w-10 h-6 rounded-full transition-colors duration-200 relative
				${checked ? 'bg-accent' : 'bg-surface-hover'}
				${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
				hover:${checked ? 'bg-accent-hover' : 'bg-surface'}
				focus-visible:outline-2 focus-visible:outline-border-focus focus-visible:outline-offset-2
				${className}
			`}
			{...rest}
		>
			<span
				className={`
					absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-text-inverse
					transition-transform duration-200 ease-out
					${checked ? 'translate-x-4' : 'translate-x-0'}
				`}
			/>
		</button>
	);
};
