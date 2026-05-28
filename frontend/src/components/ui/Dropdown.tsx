import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, Check, Search, X, Minus } from 'lucide-react';
import { Badge } from './Badge';
import { Spinner } from './Spinner';

export type DropdownVariant = 'single' | 'searchable' | 'multi' | 'grouped';

export interface DropdownOption {
	value: string;
	label: string;
	disabled?: boolean;
}

export interface DropdownGroup {
	label: string;
	options: DropdownOption[];
}

interface DropdownOwnProps {
	variant?: DropdownVariant;
	options: DropdownOption[] | DropdownGroup[];
	value?: string; // Single/multi: selected value(s)
	values?: string[]; // Multi: selected values
	placeholder?: string;
	onChange: (value: string) => void;
	onMultiChange?: (values: string[]) => void;
	disabled?: boolean;
	error?: string;
	clearable?: boolean;
	loading?: boolean;
	className?: string;
}

export type DropdownProps = DropdownOwnProps &
	Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'size'>;

const isGroup = (item: DropdownOption | DropdownGroup): item is DropdownGroup =>
	!Array.isArray((item as DropdownGroup).options) ? false : true;

const isOptionDisabled = (option: DropdownOption) => {
	return option.disabled ?? false;
};

export const Dropdown: React.FC<DropdownProps> = ({
	variant = 'single',
	options,
	value,
	values,
	placeholder = 'Select...',
	onChange,
	onMultiChange,
	disabled = false,
	error,
	clearable = false,
	loading = false,
	className = '',
	...rest
}) => {
	const [open, setOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');
	const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const listRef = useRef<HTMLUListElement>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);

	// Flatten options for filtering/searching
	const flattenedOptions: DropdownOption[] = options.flatMap((item) => {
		if (isGroup(item)) return item.options;
		return [item];
	});

	// Filter options based on search query (searchable variant only)
	const filteredFlatOptions =
		variant === 'searchable' && searchQuery
			? flattenedOptions.filter((opt) =>
					opt.label.toLowerCase().includes(searchQuery.toLowerCase())
				)
			: flattenedOptions;

	// Build grouped options for rendering (respects search filter)
	const groupedOptions: DropdownGroup[] = options.map((item) => {
		if (isGroup(item)) {
			const filteredGroupOptions =
				variant === 'searchable' && searchQuery
					? item.options.filter((opt) =>
							opt.label.toLowerCase().includes(searchQuery.toLowerCase())
						)
					: item.options;
			return { ...item, options: filteredGroupOptions };
		}
		// For flat options, treat each as a single-option group internally
		const opt = item as DropdownOption;
		const passesFilter = variant !== 'searchable' || !searchQuery ||
			opt.label.toLowerCase().includes(searchQuery.toLowerCase());
		return { label: '', options: passesFilter ? [opt] : [] };
	}).filter((group) => group.options.length > 0);

	const handleOpen = useCallback(() => {
		if (disabled || loading) return;
		setOpen(true);
		setSearchQuery('');
		setFocusedIndex(null);
	}, [disabled, loading]);

	const handleClose = useCallback(() => {
		setOpen(false);
		setSearchQuery('');
		setFocusedIndex(null);
	}, []);

	const handleSelect = useCallback(
		(optionValue: string) => {
			if (variant === 'multi' && onMultiChange) {
				const currentValues = values || [];
				const newValues = currentValues.includes(optionValue)
					? currentValues.filter((v) => v !== optionValue)
					: [...currentValues, optionValue];
				onMultiChange(newValues);
			} else {
				onChange(optionValue);
				setOpen(false);
				setSearchQuery('');
			}
		},
		[variant, onChange, onMultiChange, values]
	);

	// Keyboard navigation
	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLButtonElement>) => {
			if (disabled || loading) return;

			if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
				e.preventDefault();
				setOpen(true);
				setSearchQuery('');
				setFocusedIndex(null);
				return;
			}

			if (open) {
				const totalOptions = filteredFlatOptions.length;

				if (e.key === 'ArrowDown') {
					e.preventDefault();
					setFocusedIndex((prev) =>
						prev === null ? 0 : (prev + 1) % totalOptions
					);
				} else if (e.key === 'ArrowUp') {
					e.preventDefault();
					setFocusedIndex((prev) =>
						prev === null ? totalOptions - 1 : (prev - 1 + totalOptions) % totalOptions
					);
				} else if (e.key === 'Home') {
					e.preventDefault();
					setFocusedIndex(0);
				} else if (e.key === 'End') {
					e.preventDefault();
					setFocusedIndex(totalOptions - 1);
				} else if (e.key === 'Enter' && focusedIndex !== null) {
					e.preventDefault();
					const option = filteredFlatOptions[focusedIndex];
					if (option && !isOptionDisabled(option)) {
						handleSelect(option.value);
					}
				} else if (e.key === 'Escape') {
					e.preventDefault();
					setOpen(false);
					setSearchQuery('');
					setFocusedIndex(null);
				}
			}
		},
		[disabled, loading, open, filteredFlatOptions, focusedIndex, handleSelect]
	);

	// Track if dropdown was open (for multi-select to stay open)
	const wasOpen = open;

	const handleClear = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			if (variant === 'multi' && onMultiChange) {
				onMultiChange([]);
			} else {
				onChange('');
			}
		},
		[variant, onChange, onMultiChange]
	);

	// Click outside handler
	useEffect(() => {
		if (!open) return;

		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node;
			if (
				buttonRef.current &&
				!buttonRef.current.contains(target) &&
				listRef.current &&
				!listRef.current.contains(target)
			) {
				setOpen(false);
				setSearchQuery('');
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [open]);

	// Focus search input when opening searchable dropdown
	useEffect(() => {
		if (open && variant === 'searchable') {
			searchInputRef.current?.focus();
		}
	}, [open, variant]);

	// Multi-select Badge chips (max 3 + "+N more")
	const multiSelectContent = () => {
		const selectedValues = values || [];
		if (selectedValues.length === 0) {
			return <span className="text-text-secondary">{placeholder}</span>;
		}

		const maxChips = 3;
		const showMore = selectedValues.length > maxChips;
		const visibleValues = showMore ? selectedValues.slice(0, maxChips) : selectedValues;

		return (
			<div className="flex-1 flex flex-wrap gap-1">
				{visibleValues.map((v) => {
					const opt = flattenedOptions.find((o) => o.value === v);
					return (
						<Badge
							key={v}
							variant="secondary"
							dismissible
							onDismiss={() => handleSelect(v)}
						>
							{opt?.label ?? v}
						</Badge>
					);
				})}
				{showMore && (
					<Badge variant="secondary">
						+{selectedValues.length - maxChips} more
					</Badge>
				)}
			</div>
		);
	};

	// Single/grouped selected label
	const selectedLabel = flattenedOptions.find((opt) => opt.value === value)?.label;

	// Button content based on variant
	const buttonContent = () => {
		if (variant === 'multi') {
			return multiSelectContent();
		}

		// Loading state for single/searchable/grouped variants
		if (loading) {
			return (
				<div className="flex items-center gap-2">
					<Spinner size={16} />
					<span className="text-text-secondary">{placeholder}</span>
				</div>
			);
		}

		const displayText = selectedLabel || placeholder;
		return (
			<span className={`flex-1 truncate ${!displayText || displayText === placeholder ? 'text-text-muted' : ''}`}>
				{displayText}
			</span>
		);
	};

	return (
		<div className={`relative w-full ${className}`}>
			{/* Trigger button */}
			<button
				ref={buttonRef}
				type="button"
				className={`
					w-full h-10 rounded-md px-3 text-sm text-left
					bg-surface-raised border text-text-primary
					transition-colors duration-150
					flex items-center justify-between gap-2
					${error
						? 'border-error focus:ring-2 focus:ring-error/20 focus:border-error'
						: open
							? 'border-accent ring-2 ring-accent/20'
							: 'border-border hover:border-border-light focus:ring-2 focus:ring-accent/20 focus:border-accent'
					}
				`}
				style={disabled ? { opacity: 0.4 } : undefined}
				onClick={handleOpen}
				onKeyDown={handleKeyDown}
				disabled={disabled}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-disabled={disabled}
				aria-activedescendant={focusedIndex !== null ? `option-${filteredFlatOptions[focusedIndex]?.value}` : undefined}
				{...rest}
			>
				{buttonContent()}
				<div className="flex items-center gap-1 shrink-0">
					{clearable && (variant === 'single' ? value : values?.length) && !open && (
						<button
							type="button"
							tabIndex={-1}
							aria-label="Clear"
							className="text-text-muted hover:text-text-primary cursor-pointer transition-colors"
							onClick={handleClear}
						>
							<X size={14} />
						</button>
					)}
					{open ? (
						<ChevronUp size={16} className="text-text-muted" aria-hidden="true" />
					) : (
						<ChevronDown size={16} className="text-text-muted" aria-hidden="true" />
					)}
				</div>
			</button>

			{/* Dropdown panel — rendered via portal to escape parent stacking context */}
			{open && createPortal(
				<div
					className="fixed z-dropdown"
					style={{
						left: buttonRef.current?.getBoundingClientRect().left,
						top: buttonRef.current?.getBoundingClientRect().bottom + 4,
						width: buttonRef.current?.getBoundingClientRect().width,
					}}
				>
					<div
						ref={listRef}
						className="w-full bg-surface-raised border border-border rounded-lg shadow-xl"
					>
						{/* Search input for searchable variant */}
						{variant === 'searchable' && (
							<div className="p-2 border-b border-border">
								<div className="relative">
									<Search
										size={16}
										className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
									/>
									<input
										ref={searchInputRef}
										type="text"
										className="w-full h-8 pl-8 pr-3 rounded text-xs bg-surface border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/20 focus:border-accent"
										placeholder="Search..."
										value={searchQuery}
										onChange={(e) => setSearchQuery(e.target.value)}
									/>
								</div>
							</div>
						)}

						{/* Options list */}
						<ul
							className="max-h-[280px] overflow-auto py-1"
							role="listbox"
							aria-multiselectable={variant === 'multi'}
						>
							{groupedOptions.map((group, idx) => {
								const hasGroupLabel = !!group.label;
								return (
									<div key={`group-${idx}`}>
										{hasGroupLabel && (
											<li className="sticky top-0 px-3 py-1.5 text-xs font-medium text-text-muted uppercase tracking-wider bg-surface-raised">
												{group.label}
											</li>
										)}
										{group.options.map((option) => {
											const isSelected = values?.includes(option.value) || value === option.value;
											const isDisabled = isOptionDisabled(option);
											const isFocused = focusedIndex !== null && 
												filteredFlatOptions[focusedIndex]?.value === option.value;

											return (
												<li
													id={`option-${option.value}`}
													key={option.value}
													className={`
														h-10 px-3 text-sm cursor-pointer flex items-center gap-2
														${isDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-surface-hover'}
														${isSelected ? 'text-primary' : 'text-text-primary'}
														${isFocused ? 'bg-surface-hover' : ''}
													`}
													role="option"
													aria-selected={isSelected}
													aria-disabled={isDisabled}
													onClick={() => !isDisabled && handleSelect(option.value)}
												>
													{/* Multi-select checkbox indicator */}
													{variant === 'multi' && (
														<div className="shrink-0 w-4 h-4 flex items-center justify-center">
															{isSelected ? (
																<Check size={14} className="text-primary" />
															) : (
																<div className="w-3.5 h-3.5 border border-border rounded-sm" />
															)}
														</div>
													)}
													<span className="flex-1 truncate">{option.label}</span>
													{/* Single/grouped: show checkmark on right for selected */}
													{variant !== 'multi' && isSelected && (
														<Check size={14} className="text-primary shrink-0" />
													)}
												</li>
											);
										})}
									</div>
								);
							})}

							{filteredFlatOptions.length === 0 && (
								<li className="px-3 py-4 text-sm text-text-muted text-center">
									No options available
								</li>
							)}
						</ul>
					</div>
				</div>,
				document.body
			)}

			{/* Error message */}
			{error && (
				<p className="mt-1 text-xs text-error">{error}</p>
			)}
		</div>
	);
};
