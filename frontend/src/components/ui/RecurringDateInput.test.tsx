import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { RecurringDateInput } from './RecurringDateInput';

const mockParseRule = (text: string) => ({
	nextDate: text.includes('monday') ? new Date() : undefined,
	valid: text.includes('monday'),
});

describe('RecurringDateInput', () => {
	it('renders with placeholder', () => {
		render(<RecurringDateInput parseRule={mockParseRule} onChange={() => {}} />);
		expect(screen.getByPlaceholderText(/every Monday/i)).toBeInTheDocument();
	});

	it('calls onChange when text changes', async () => {
		const user = userEvent.setup();
		const handleChange = vi.fn();
		render(<RecurringDateInput parseRule={mockParseRule} onChange={handleChange} />);
		const input = screen.getByPlaceholderText(/every Monday/i);
		await user.type(input, 'every monday');
		expect(handleChange).toHaveBeenCalled();
	});

	it('shows confirm button for valid input', async () => {
		const user = userEvent.setup();
		render(<RecurringDateInput parseRule={mockParseRule} onChange={() => {}} />);
		const input = screen.getByPlaceholderText(/every Monday/i);
		await user.type(input, 'every monday');
		expect(screen.getByTitle('Confirm pattern')).toBeInTheDocument();
	});

	it('disables confirm button for invalid input', async () => {
		const user = userEvent.setup();
		render(<RecurringDateInput parseRule={mockParseRule} onChange={() => {}} />);
		const input = screen.getByPlaceholderText(/every Monday/i);
		await user.type(input, 'invalid text');
		expect(screen.getByTitle('Confirm pattern')).toBeDisabled();
	});

	it('shows error for invalid pattern', async () => {
		const user = userEvent.setup();
		render(<RecurringDateInput parseRule={mockParseRule} onChange={() => {}} />);
		const input = screen.getByPlaceholderText(/every Monday/i);
		await user.type(input, 'invalid text');
		expect(screen.getByText('Invalid pattern')).toBeInTheDocument();
	});

	it('displays confirmed state with clear button', () => {
		render(
			<RecurringDateInput
				parseRule={mockParseRule}
				value="every monday"
				confirmed={true}
				onChange={() => {}}
			/>
		);
		expect(screen.getByTitle('Edit pattern')).toBeInTheDocument();
	});

	it('disables when disabled', () => {
		render(<RecurringDateInput parseRule={mockParseRule} onChange={() => {}} disabled />);
		expect(screen.getByPlaceholderText(/every Monday/i)).toBeDisabled();
	});
});
