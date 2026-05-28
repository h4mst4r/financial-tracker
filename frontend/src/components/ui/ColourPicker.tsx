import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

const PALETTE_SWATCHES = [
	'#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
	'#ec4899', '#f43f5e', '#ef4444', '#f97316',
	'#eab308', '#84cc16', '#22c55e', '#10b981',
	'#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6',
	'#2563eb', '#4f46e5', '#7c3aed', '#c026d3',
	'#db2777', '#dc2626', '#ea580c', '#ca8a04',
	'#65a30d', '#16a34a', '#059669', '#0d9488',
	'#0891b2', '#0284c7', '#1d4ed8', '#6d28d9',
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
					bg-surface-raised border border-border text-text-primary
					transition-colors duration-150
					flex items-center gap-2
					${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-border-light'}
					${open ? 'border-accent ring-2 ring-accent/20' : ''}
				`}
				onClick={handleOpen}
				disabled={disabled}
				{...rest}
			>
				<span
					className="w-4 h-4 rounded-full border border-border shrink-0"
					style={{ backgroundColor: value }}
				/>
				<span className="text-text-secondary font-mono text-xs">{value}</span>
			</button>

			{/* Picker panel — rendered via portal to escape parent stacking context */}
			{open && buttonRef.current && createPortal(
				<div
					ref={panelRef}
					className="fixed z-dropdown"
					style={{
						left: buttonRef.current.getBoundingClientRect().left,
						top: buttonRef.current.getBoundingClientRect().bottom + 4,
					}}
				>
					<div className="w-colour-picker bg-surface-raised border border-border rounded-md shadow-lg p-3">
						{/* Mode tabs */}
						<div className="flex gap-1 mb-3">
						<button
							type="button"
							className={`
								flex-1 text-xs py-1.5 rounded transition-colors
								${mode === 'palette'
									? 'bg-accent/20 text-accent font-medium'
									: 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
								}
							`}
							onClick={() => setMode('palette')}
						>
							Palette
						</button>
						<button
							type="button"
							className={`
								flex-1 text-xs py-1.5 rounded transition-colors
								${mode === 'hex'
									? 'bg-accent/20 text-accent font-medium'
									: 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
								}
							`}
							onClick={() => setMode('hex')}
						>
							Hex
						</button>
					</div>

					{mode === 'palette' ? (
						/* Palette grid */
						<div className="grid grid-cols-8 gap-1.5">
							{PALETTE_SWATCHES.map((swatch) => (
								<button
									key={swatch}
									type="button"
									className={`
										w-7 h-7 rounded-full transition-transform hover:scale-110
										${value === swatch ? 'ring-2 ring-white' : ''}
									`}
									style={{ backgroundColor: swatch }}
									onClick={() => handleSelectSwatch(swatch)}
									aria-label={`Select ${swatch}`}
								/>
							))}
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
								className="flex-1 h-9 px-2 rounded text-xs font-mono bg-surface border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/20 focus:border-accent"
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
