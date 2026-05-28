import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Calendar, X } from 'lucide-react';
import {
	format,
	startOfMonth,
	endOfMonth,
	startOfWeek,
	endOfWeek,
	addMonths,
	subMonths,
	isSameMonth,
	isSameDay,
	isBefore,
	isAfter,
	isWithinInterval,
	isToday,
	parse,
} from 'date-fns';

interface DatePickerOwnProps {
	value?: Date | undefined;
	onChange: (date: Date | undefined) => void;
	disabled?: boolean;
	minDate?: Date;
	maxDate?: Date;
	placeholder?: string;
	error?: string;
	className?: string;
}

export type DatePickerProps = DatePickerOwnProps &
	Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'size'>;

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export const DatePicker: React.FC<DatePickerProps> = ({
	value,
	onChange,
	disabled = false,
	minDate,
	maxDate,
	placeholder = 'DD-MM-YYYY',
	error,
	className = '',
	...rest
}) => {
	const [open, setOpen] = useState(false);
	const [viewDate, setViewDate] = useState(value ?? new Date());
	const buttonRef = useRef<HTMLButtonElement>(null);
	const calendarRef = useRef<HTMLDivElement>(null);

	const handleOpen = useCallback(() => {
		if (disabled) return;
		setOpen(true);
		setViewDate(value ?? new Date());
	}, [disabled, value]);

	const handleClose = useCallback(() => {
		setOpen(false);
	}, []);

	const handleSelect = useCallback(
		(date: Date) => {
			onChange(date);
			setOpen(false);
		},
		[onChange]
	);

	const handleClear = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			onChange(undefined);
		},
		[onChange]
	);

	const prevMonth = () => setViewDate(subMonths(viewDate, 1));
	const nextMonth = () => setViewDate(addMonths(viewDate, 1));

	// Generate calendar days
	const monthStart = startOfMonth(viewDate);
	const monthEnd = endOfMonth(viewDate);
	const calendarStart = startOfWeek(monthStart);
	const calendarEnd = endOfWeek(monthEnd);

	const days: Date[] = [];
	let current = calendarStart;
	while (isWithinInterval(current, { start: calendarStart, end: calendarEnd })) {
		days.push(current);
		current = new Date(current);
		current.setDate(current.getDate() + 1);
	}

	// Click outside handler
	useEffect(() => {
		if (!open) return;

		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node;
			if (
				buttonRef.current &&
				!buttonRef.current.contains(target) &&
				calendarRef.current &&
				!calendarRef.current.contains(target)
			) {
				setOpen(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [open]);

	const isDateDisabled = (date: Date): boolean => {
		if (minDate && isBefore(date, minDate)) return true;
		if (maxDate && isAfter(date, maxDate)) return true;
		return false;
	};

	const displayValue = value ? format(value, 'dd-MM-yyyy') : '';

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
					flex items-center justify-between gap-2
					${disabled ? 'opacity-50 cursor-not-allowed bg-surface' : ''}
					${error
						? 'border-error focus:ring-2 focus:ring-error/20 focus:border-error'
						: open
							? 'border-accent ring-2 ring-accent/20'
							: 'border-border hover:border-border-light focus:ring-2 focus:ring-accent/20 focus:border-accent'
					}
				`}
				onClick={handleOpen}
				disabled={disabled}
				{...rest}
			>
				<span className={`flex items-center gap-2 ${!displayValue ? 'text-text-muted' : ''}`}>
					<Calendar size={16} className="shrink-0" />
					{displayValue || placeholder}
				</span>
				{displayValue && !open && (
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
			</button>

{/* Calendar popover — rendered via portal to escape parent stacking context */}
		{open && createPortal(
			<div
				ref={calendarRef}
				className="fixed z-dropdown"
				style={{
					left: buttonRef.current?.getBoundingClientRect().left,
					top: buttonRef.current?.getBoundingClientRect().bottom + 4,
				}}
			>
				<div className="w-[320px] bg-surface-raised border border-border rounded-md shadow-lg p-3">
					{/* Month navigation */}
					<div className="flex items-center justify-between mb-3">
						<button
							type="button"
							className="p-1 hover:bg-surface-hover rounded transition-colors"
							onClick={prevMonth}
							aria-label="Previous month"
						>
							<ChevronLeft size={16} />
						</button>
						<span className="text-sm font-medium text-text-primary">
							{format(viewDate, 'MMMM yyyy')}
						</span>
						<button
							type="button"
							className="p-1 hover:bg-surface-hover rounded transition-colors"
							onClick={nextMonth}
							aria-label="Next month"
						>
							<ChevronRight size={16} />
						</button>
					</div>

					{/* Weekday headers */}
					<div className="grid grid-cols-7 gap-1 mb-2">
						{WEEKDAYS.map((day) => (
							<div
								key={day}
								className="text-center text-xs font-medium text-text-muted py-1"
							>
								{day}
							</div>
						))}
					</div>

					{/* Calendar grid */}
					<div className="grid grid-cols-7 gap-1">
						{days.map((date, idx) => {
							const isSelected = value ? isSameDay(date, value) : false;
							const isCurrentMonth = isSameMonth(date, viewDate);
							const isTodayDate = isToday(date);
							const disabled = isDateDisabled(date);

							return (
								<button
									key={idx}
									type="button"
									className={`
										w-8 h-8 rounded text-xs flex items-center justify-center
										transition-colors duration-100
										${!isCurrentMonth ? 'text-text-muted/30' : ''}
										${isTodayDate && !isSelected ? 'border border-accent text-accent' : ''}
										${isSelected
											? 'bg-accent text-text-inverse font-semibold'
											: disabled
												? 'opacity-30 cursor-not-allowed'
												: 'hover:bg-surface-hover text-text-primary cursor-pointer'
										}
									`}
									onClick={() => !disabled && handleSelect(date)}
									disabled={disabled}
								>
									{format(date, 'd')}
								</button>
							);
						})}
					</div>

					{/* Today button */}
					<div className="mt-2 pt-2 border-t border-border">
						<button
							type="button"
							className="w-full text-xs text-accent hover:bg-surface-hover rounded py-1.5 transition-colors"
							onClick={() => handleSelect(new Date())}
						>
							Select Today
						</button>
					</div>
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
