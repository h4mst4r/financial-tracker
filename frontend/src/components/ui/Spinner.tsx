import React from 'react';

const sizeMap = {
	sm: 16,
	md: 24,
	lg: 40,
} as const;

export type SpinnerSize = keyof typeof sizeMap;

interface SpinnerProps {
	size?: SpinnerSize;
	/** Override color — defaults to currentColor so the spinner inherits the parent's text color */
	color?: string;
	/**
	 * Set true for standalone spinners (e.g. page-level loading state).
	 * Adds role="status" and aria-label="Loading" so screen readers announce it.
	 * Defaults to false (decorative — hidden from ARIA when inside a button or labelled region).
	 */
	standalone?: boolean;
	className?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({
	size = 'md',
	color,
	standalone = false,
	className = '',
}) => {
	const dimension = sizeMap[size];

	return (
		<svg
			width={dimension}
			height={dimension}
			viewBox={`0 0 ${dimension} ${dimension}`}
			className={`animate-spinner motion-reduce:animate-none shrink-0 ${className}`}
			style={color ? { color } : undefined}
			aria-hidden={standalone ? undefined : 'true'}
			aria-label={standalone ? 'Loading' : undefined}
			role={standalone ? 'status' : undefined}
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
