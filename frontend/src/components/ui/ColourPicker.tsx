import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useFloatingPosition } from '../../hooks/useFloatingPosition';

// The 14 entity accent colours — shown first so users can match entity type colours
const ENTITY_SWATCHES: Array<{ colour: string; label: string }> = [
	{ colour: '#6366f1', label: 'Account (indigo)' },
	{ colour: '#ef4444', label: 'Credit / Debt (red)' },
	{ colour: '#10b981', label: 'Capital (green)' },
	{ colour: '#f59e0b', label: 'Asset (amber)' },
	{ colour: '#06b6d4', label: 'Insurance / Category (cyan)' },
	{ colour: '#8b5cf6', label: 'Event (purple)' },
	{ colour: '#ec4899', label: 'Recurring (pink)' },
	{ colour: '#14b8a6', label: 'Transfer (teal)' },
	{ colour: '#f97316', label: 'Budget (orange)' },
	{ colour: '#a78bfa', label: 'Currency (violet)' },
	{ colour: '#6ee7b7', label: 'Formula (mint)' },
	{ colour: '#38bdf8', label: 'Person (sky)' },
];

// 16 extended palette colours for categories and custom entities
const EXTENDED_SWATCHES: string[] = [
	'#dc2626', '#fb923c', '#fcd34d', '#bef264',
	'#4ade80', '#2dd4bf', '#7dd3fc', '#c084fc',
	'#fb7185', '#e879f9', '#94a3b8', '#78716c',
	'#1d4ed8', '#7c3aed', '#db2777', '#0d9488',
];

interface ColourPickerOwnProps {
	value?: string;
	onChange: (colour: string) => void;
	disabled?: boolean;
	className?: string;
}

export type ColourPickerProps = ColourPickerOwnProps &
	Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'size'>;

export const ColourPicker: React.FC<ColourPickerProps> = ({
	value = '#6366f1',
	onChange,
	disabled = false,
	className = '',
	...rest
}) => {
	const [open, setOpen] = useState(false);
	const [mode, setMode] = useState<'palette' | 'hex'>('palette');
	const [hexInput, setHexInput] = useState(value);
	const [lastValid, setLastValid] = useState(value);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	const panelPos = useFloatingPosition(buttonRef, open);

	const handleOpen = useCallback(() => {
		if (disabled) return;
		setOpen(true);
		setHexInput(value);
	}, [disabled, value]);

	const handleSelectSwatch = useCallback(
		(colour: string) => {
			onChange(colour);
			setLastValid(colour);
			setHexInput(colour);
		},
		[onChange]
	);

	const handleHexBlur = useCallback(() => {
		if (/^#[0-9A-Fa-f]{6}$/.test(hexInput)) {
			onChange(hexInput);
			setLastValid(hexInput);
		} else {
			setHexInput(lastValid);
		}
	}, [hexInput, lastValid, onChange]);

	useEffect(() => {
		if (!open) return;

		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node;
			if (
				buttonRef.current &&
				!buttonRef.current.contains(target) &&
				panelRef.current &&
				!panelRef.current.contains(target)
			) {
				setOpen(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [open]);

	return (
		<div className={`relative w-full ${className}`}>
			{/* Trigger button */}
			<button
				ref={buttonRef}
				type="button"
				className={`
					w-full h-10 rounded-md px-3 text-sm
					bg-surface-raised border text-text-primary
					transition-colors duration-150
					flex items-center gap-2
					${disabled ? 'opacity-50 cursor-not-allowed' : open ? 'border-accent ring-2 ring-glow-accent' : 'border-border hover:border-border-light focus:ring-2 focus:ring-glow-accent focus:border-accent'}
				`}
				onClick={handleOpen}
				disabled={disabled}
				{...rest}
			>
				<span
					className="w-4 h-4 rounded-full border border-border shrink-0"
					style={{ backgroundColor: value }}
				/>
				<span className="text-text-primary font-mono text-xs">{value}</span>
			</button>

			{/* Picker panel — rendered via portal to escape parent stacking context */}
			{open && panelPos && createPortal(
				<div
					ref={panelRef}
					className="fixed z-dropdown"
					style={{ top: panelPos.top, left: panelPos.left }}
				>
					<div className="w-colour-picker bg-surface-raised border border-border rounded-md shadow-lg p-3">
						{/* Mode tabs */}
						<div className="flex gap-1 mb-3">
							<button
								type="button"
								className={`
									flex-1 text-xs py-1.5 rounded transition-colors focus:outline-none
									${mode === 'palette'
										? 'bg-accent-active text-accent font-medium'
										: 'text-text-secondary hover:text-text-primary hover:bg-surface-active'
									}
								`}
								onClick={() => setMode('palette')}
							>
								Palette
							</button>
							<button
								type="button"
								className={`
									flex-1 text-xs py-1.5 rounded transition-colors focus:outline-none
									${mode === 'hex'
										? 'bg-accent-active text-accent font-medium'
										: 'text-text-secondary hover:text-text-primary hover:bg-surface-active'
									}
								`}
								onClick={() => setMode('hex')}
							>
								Hex
							</button>
						</div>

						{mode === 'palette' ? (
							<div className="space-y-2">
								{/* Entity accent colours */}
								<p className="text-2xs text-text-muted uppercase tracking-wider font-medium">Entity colours</p>
								<div className="grid grid-cols-6 gap-1.5">
									{ENTITY_SWATCHES.map(({ colour, label }) => (
										<button
											key={colour}
											type="button"
											className={`
												w-7 h-7 rounded-full transition-transform hover:scale-110 focus:outline-none
												${value === colour ? 'ring-2 ring-offset-1 ring-accent ring-offset-surface-raised' : ''}
											`}
											style={{ backgroundColor: colour }}
											onClick={() => handleSelectSwatch(colour)}
											title={label}
											aria-label={label}
										/>
									))}
								</div>
								{/* Extended palette */}
								<p className="text-2xs text-text-muted uppercase tracking-wider font-medium pt-1">Extended</p>
								<div className="grid grid-cols-8 gap-1.5">
									{EXTENDED_SWATCHES.map((colour) => (
										<button
											key={colour}
											type="button"
											className={`
												w-7 h-7 rounded-full transition-transform hover:scale-110 focus:outline-none
												${value === colour ? 'ring-2 ring-offset-1 ring-accent ring-offset-surface-raised' : ''}
											`}
											style={{ backgroundColor: colour }}
											onClick={() => handleSelectSwatch(colour)}
											aria-label={`Select ${colour}`}
										/>
									))}
								</div>
							</div>
						) : (
							/* Hex input */
							<div className="flex items-center gap-2">
								<span
									className="w-8 h-8 rounded border border-border shrink-0"
									style={{ backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(hexInput) ? hexInput : lastValid }}
								/>
								<input
									type="text"
									className="flex-1 h-9 px-2 rounded text-xs font-mono bg-surface border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-glow-primary focus:border-border-focus"
									placeholder="#RRGGBB"
									value={hexInput}
									onChange={(e) => setHexInput(e.target.value)}
									onBlur={handleHexBlur}
								/>
							</div>
						)}
					</div>
				</div>,
				document.body
			)}
		</div>
	);
};
