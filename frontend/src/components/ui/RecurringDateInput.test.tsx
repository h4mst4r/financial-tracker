import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { RecurringDateInput } from './RecurringDateInput';

const mockParseRule = (text: string) => ({
	nextDate: text.includes('monday') ? new Date() : undefined,
	valid: text.includes('monday'),
});

const user = userEvent.setup({ delay: null });

describe('RecurringDateInput', () => {
	it('renders with placeholder', () => {
		render(<RecurringDateInput parseRule={mockParseRule} onChange={() => {}} />);
		expect(screen.getByPlaceholderText(/every Monday/i)).toBeInTheDocument();
	});

	it('calls onChange after the 500ms debounce (E34)', async () => {
		const handleChange = vi.fn();
		render(<RecurringDateInput parseRule={mockParseRule} onChange={handleChange} />);
		await user.type(screen.getByPlaceholderText(/every Monday/i), 'a');
		// onChange is debounced at 500ms — should not fire synchronously
		expect(handleChange).not.toHaveBeenCalled();
		// Wait for debounce to fire
		await waitFor(() => expect(handleChange).toHaveBeenCalled(), { timeout: 700 });
	}, 1500);

	it('shows confirm button for valid input', async () => {
		render(<RecurringDateInput parseRule={mockParseRule} onChange={() => {}} />);
		await user.type(screen.getByPlaceholderText(/every Monday/i), 'every monday');
		expect(screen.getByTitle('Confirm pattern')).toBeInTheDocument();
	});

	it('disables confirm button for invalid input', async () => {
		render(<RecurringDateInput parseRule={mockParseRule} onChange={() => {}} />);
		await user.type(screen.getByPlaceholderText(/every Monday/i), 'invalid text');
		expect(screen.getByTitle('Confirm pattern')).toBeDisabled();
	});

	it('shows error for invalid pattern', async () => {
		render(<RecurringDateInput parseRule={mockParseRule} onChange={() => {}} />);
		await user.type(screen.getByPlaceholderText(/every Monday/i), 'invalid text');
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

	it('shows next occurrence preview for valid input', async () => {
		render(<RecurringDateInput parseRule={mockParseRule} onChange={() => {}} />);
		await user.type(screen.getByPlaceholderText(/every Monday/i), 'every monday');
		await waitFor(() => expect(screen.getByText(/Next:/i)).toBeInTheDocument());
	});
});
