import React from 'react';

interface DividerProps {
	orientation?: 'horizontal' | 'vertical';
	variant?: 'default' | 'light';
	label?: string;
	className?: string;
}

export const Divider: React.FC<DividerProps> = ({
	orientation = 'horizontal',
	variant = 'default',
	label,
	className = '',
}) => {
	const borderClass = variant === 'light' ? 'border-surface-hover' : 'border-border';

	if (label) {
		return (
			<div className={`flex items-center my-4 ${className}`}>
				<div className={`flex-grow border-t ${borderClass}`} />
				<span className="mx-3 text-xs tracking-widest font-medium text-text-muted">
					{label}
				</span>
				<div className={`flex-grow border-t ${borderClass}`} />
			</div>
		);
	}

	if (orientation === 'vertical') {
		return (
			<div className="inline-block mx-3 align-middle w-px h-[1.25em] bg-border" />
		);
	}

	return (
		<hr
			className={`my-4 border-t ${borderClass} ${variant === 'light' ? 'my-3' : ''} ${className}`}
		/>
	);
};
