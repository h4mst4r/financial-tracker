import React, { useState, useEffect, useCallback } from 'react';
import { Check, X } from 'lucide-react';
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

	useEffect(() => {
		setText(value ?? '');
	}, [value]);

	const handleTextChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const newText = e.target.value;
			setText(newText);
			setIsEditing(true);
			onChange(newText, false);
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

	return (
		<div className={`flex gap-2 ${className}`} {...rest}>
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
	);
};
