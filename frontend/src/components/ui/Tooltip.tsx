import React, { useState, useRef, useEffect } from 'react';

interface TooltipProps {
	content: React.ReactNode;
	delay?: number;
	placement?: 'top' | 'bottom';
	children: React.ReactNode;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, delay = 200, placement = 'top', children }) => {
	const [visible, setVisible] = useState(false);
	const [timedOut, setTimedOut] = useState(false);
	const timerRef = useRef<number | null>(null);

	// Show after delay on hover/focus
	const show = () => {
		setTimedOut(false);
		timerRef.current = window.setTimeout(() => {
			setVisible(true);
			setTimedOut(true);
		}, delay);
	};

	// Hide immediately
	const hide = () => {
		if (timerRef.current) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		setVisible(false);
		setTimedOut(false);
	};

	// Escape key dismiss
	useEffect(() => {
		if (!visible) return;

		const handleKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') hide();
		};
		document.addEventListener('keydown', handleKey);
		return () => document.removeEventListener('keydown', handleKey);
	}, [visible]);

	// Clean up timer on unmount
	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);

	return (
		<div className="relative inline-flex">
			<div
				onMouseEnter={show}
				onMouseLeave={hide}
				onFocus={show}
				onBlur={hide}
			>
				{children}
			</div>
			{visible && timedOut && (
				<div
					className={`absolute z-tooltip left-1/2 -translate-x-1/2 px-3 py-2 max-w-tooltip rounded-md text-xs shadow-lg whitespace-normal break-words ${placement === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2'}`}
					style={{
						backgroundColor: 'var(--color-surface-overlay, var(--color-bg-elevated))',
						border: '1px solid var(--color-border-light)',
						color: 'var(--color-text-primary)',
					}}
					role="tooltip"
				>
					{content}
					{/* Arrow */}
					{placement === 'bottom' ? (
						<div
							className="absolute left-1/2 -translate-x-1/2 bottom-full"
							style={{
								borderLeft: '6px solid transparent',
								borderRight: '6px solid transparent',
								borderBottom: '6px solid var(--color-border-light)',
							}}
						/>
					) : (
						<div
							className="absolute left-1/2 -translate-x-1/2 top-full"
							style={{
								borderLeft: '6px solid transparent',
								borderRight: '6px solid transparent',
								borderTop: '6px solid var(--color-border-light)',
							}}
						/>
					)}
				</div>
			)}
		</div>
	);
};
