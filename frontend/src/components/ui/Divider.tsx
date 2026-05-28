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
	if (label) {
		return (
			<div className={`flex items-center my-4 ${className}`}>
				<div
					className="flex-grow border-t"
					style={{
						borderColor: variant === 'light' ? 'var(--color-surface-hover)' : 'var(--color-border)',
					}}
				/>
				<span className="mx-3 text-xs tracking-widest font-medium text-text-muted">
					{label}
				</span>
				<div
					className="flex-grow border-t"
					style={{
						borderColor: variant === 'light' ? 'var(--color-surface-hover)' : 'var(--color-border)',
					}}
				/>
			</div>
		);
	}

	if (orientation === 'vertical') {
		return (
			<div
				className="inline-block mx-3 align-middle"
				style={{
					width: '1px',
					height: '1.25em',
					backgroundColor: variant === 'light' ? 'var(--color-border-light)' : 'var(--color-border-light)',
				}}
			/>
		);
	}

	return (
		<hr
			className={`my-4 border-t ${variant === 'light' ? 'my-3' : ''} ${className}`}
			style={{
				borderColor: variant === 'light' ? 'var(--color-surface-hover)' : 'var(--color-border)',
			}}
		/>
	);
};
