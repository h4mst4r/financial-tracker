import React from 'react';

const sizeMap = {
	sm: 16,
	md: 24,
	lg: 40,
} as const;

export type SpinnerSize = keyof typeof sizeMap;

interface SpinnerProps {
	size?: SpinnerSize;
	className?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ size = 'md', className = '' }) => {
	const dimension = sizeMap[size];

	return (
		<svg
			width={dimension}
			height={dimension}
			viewBox={`0 0 ${dimension} ${dimension}`}
			className={`animate-spin ${className}`}
			style={{ color: 'var(--color-accent)' }}
			aria-label="Loading"
			role="status"
		>
			<circle
				cx={dimension / 2}
				cy={dimension / 2}
				r={dimension / 2 - 2}
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeDasharray={`${dimension * 0.75} ${dimension * 0.25}`}
				strokeLinecap="round"
			/>
		</svg>
	);
};
