import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Check, X, Calendar } from 'lucide-react';
import { Input } from './Input';
import { Button } from './Button';

interface RecurringDateInputOwnProps {
	value?: string;
	confirmed?: boolean;
	parseRule: (text: string) => { nextDate?: Date; valid: boolean };
	onChange: (value: string, confirmed: boolean) => void;
	disabled?: boolean;
	error?: string;
	className?: string;
}

export type RecurringDateInputProps = RecurringDateInputOwnProps &
	Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange' | 'disabled' | 'error'>;

export const RecurringDateInput: React.FC<RecurringDateInputProps> = ({
	value,
	confirmed = false,
	parseRule,
	onChange,
	disabled = false,
	error,
	className = '',
	...rest
}) => {
	const [text, setText] = useState(value ?? '');
	const [isEditing, setIsEditing] = useState(!confirmed);
	const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		setText(value ?? '');
	}, [value]);

	// Cleanup debounce timer on unmount
	useEffect(() => {
		return () => {
			if (debounceTimer.current) clearTimeout(debounceTimer.current);
		};
	}, []);

	const handleTextChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const newText = e.target.value;
			setText(newText);
			setIsEditing(true);

			// Debounce the onChange call (500ms per spec)
			if (debounceTimer.current) clearTimeout(debounceTimer.current);
			debounceTimer.current = setTimeout(() => {
				onChange(newText, false);
			}, 500);
		},
		[onChange]
	);

	const handleConfirm = useCallback(() => {
		if (!text.trim()) return;
		setIsEditing(false);
		onChange(text, true);
	}, [text, onChange]);

	const handleClear = useCallback(() => {
		setText('');
		setIsEditing(true);
		onChange('', false);
	}, [onChange]);

	const parseResult = parseRule(text);

	// Format next occurrence for preview (E35)
	const nextDatePreview = useCallback((date: Date | undefined) => {
		if (!date) return '';
		return date.toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
		});
	}, []);

	return (
		<div className={`flex flex-col gap-1 ${className}`} {...rest}>
			<div className="flex gap-2">
				{/* Free text input */}
				<div className="flex-1">
					<Input
						type="text"
						value={text}
						onChange={handleTextChange}
						disabled={disabled}
						error={error || (!parseResult.valid && text ? 'Invalid pattern' : undefined)}
						placeholder="e.g., every Monday, 2nd of month..."
					/>
				</div>

				{/* Confirm button */}
				{isEditing && text && (
					<Button
						variant="primary"
						size="sm"
						onClick={handleConfirm}
						disabled={disabled || !parseResult.valid}
						title="Confirm pattern"
					>
						<Check size={16} />
					</Button>
				)}

				{/* Clear button */}
				{confirmed && (
					<Button
						variant="ghost"
						size="sm"
						onClick={handleClear}
						disabled={disabled}
						title="Edit pattern"
					>
						<X size={16} />
					</Button>
				)}
			</div>

			{/* E35: Next occurrence preview */}
			{parseResult.valid && parseResult.nextDate && (
				<div className="flex items-center gap-1.5 text-xs text-text-muted">
					<Calendar size={12} />
					<span>Next: {nextDatePreview(parseResult.nextDate)}</span>
				</div>
			)}
		</div>
	);
};
