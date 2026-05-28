import React, { useState, useCallback } from 'react';
import { Badge } from './Badge';
import { Input } from './Input';

interface TagInputOwnProps {
	value?: string[];
	onChange: (tags: string[]) => void;
	placeholder?: string;
	disabled?: boolean;
	error?: string;
	className?: string;
}

export type TagInputProps = TagInputOwnProps &
	Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange' | 'disabled' | 'error'>;

export const TagInput: React.FC<TagInputProps> = ({
	value = [],
	onChange,
	placeholder = 'Add a tag...',
	disabled = false,
	error,
	className = '',
	...rest
}) => {
	const [inputValue, setInputValue] = useState('');

	const addTag = useCallback(
		(tag: string) => {
			const trimmed = tag.trim();
			if (!trimmed) return;
			// Reject duplicates (case-insensitive)
			if (value.some((t) => t.toLowerCase() === trimmed.toLowerCase())) return;
			onChange([...value, trimmed]);
			setInputValue('');
		},
		[value, onChange]
	);

	const removeTag = useCallback(
		(index: number) => {
			onChange(value.filter((_, i) => i !== index));
		},
		[value, onChange]
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === 'Enter' || e.key === ',') {
				e.preventDefault();
				addTag(inputValue);
			}
			if (e.key === 'Backspace' && !inputValue && value.length > 0) {
				onChange(value.slice(0, -1));
			}
		},
		[inputValue, value, onChange, addTag]
	);

	const handleBlur = useCallback(() => {
		if (inputValue.trim()) {
			addTag(inputValue);
		}
	}, [inputValue, addTag]);

	return (
		<div className={`flex flex-wrap gap-2 items-center ${className}`} {...rest}>
			{/* Existing tags */}
			{value.map((tag, index) => (
				<Badge
					key={`${tag}-${index}`}
					variant="info"
					dismissible
					onDismiss={() => removeTag(index)}
				>
					{tag}
				</Badge>
			))}

			{/* Input for new tags */}
			<Input
				type="text"
				value={inputValue}
				onChange={(e) => setInputValue(e.target.value)}
				onKeyDown={handleKeyDown}
				onBlur={handleBlur}
				disabled={disabled}
				error={error}
				placeholder={value.length === 0 ? placeholder : undefined}
			/>
		</div>
	);
};
