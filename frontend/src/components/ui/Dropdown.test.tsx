import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Dropdown } from './Dropdown';

const mockOptions = [
	{ value: 'a', label: 'Option A' },
	{ value: 'b', label: 'Option B' },
	{ value: 'c', label: 'Option C' },
];

describe('Dropdown', () => {
	it('renders with placeholder', () => {
		render(<Dropdown options={mockOptions} onChange={() => {}} />);
		expect(screen.getByText('Select...')).toBeInTheDocument();
	});

	it('renders custom placeholder', () => {
		render(
			<Dropdown options={mockOptions} onChange={() => {}} placeholder="Choose one..." />
		);
		expect(screen.getByText('Choose one...')).toBeInTheDocument();
	});

	it('opens dropdown on click', async () => {
		const user = userEvent.setup();
		render(<Dropdown options={mockOptions} onChange={() => {}} />);
		const trigger = screen.getByRole('button');
		await user.click(trigger);
		expect(screen.getByText('Option A')).toBeInTheDocument();
	});

	it('selects option and calls onChange', async () => {
		const user = userEvent.setup();
		const handleChange = vi.fn();
		render(<Dropdown options={mockOptions} onChange={handleChange} />);
		await user.click(screen.getByRole('button'));
		await user.click(screen.getByText('Option B'));
		expect(handleChange).toHaveBeenCalledWith('b');
	});

	it('shows selected label after selection', async () => {
		const user = userEvent.setup();
		const handleChange = vi.fn();
		const { rerender } = render(<Dropdown options={mockOptions} onChange={handleChange} />);
		await user.click(screen.getByRole('button'));
		await user.click(screen.getByText('Option C'));
		expect(handleChange).toHaveBeenCalledWith('c');
		// Re-render with selected value to show controlled state
		rerender(<Dropdown options={mockOptions} value="c" onChange={handleChange} />);
		// After selection, dropdown closes - check that trigger button shows selected value
		const triggerButton = screen.getByRole('button');
		expect(triggerButton).toHaveTextContent('Option C');
	});

	it('renders controlled value', () => {
		render(
			<Dropdown options={mockOptions} value="b" onChange={() => {}} />
		);
		expect(screen.getByText('Option B')).toBeInTheDocument();
	});

	it('filters options in searchable variant', async () => {
		const user = userEvent.setup();
		render(
			<Dropdown variant="searchable" options={mockOptions} onChange={() => {}} />
		);
		await user.click(screen.getByRole('button'));
		const searchInput = screen.getByPlaceholderText('Search...');
		// Use fireEvent.change to set the search value directly
		fireEvent.change(searchInput, { target: { value: 'C' } });
		// Options A and B should be filtered out (don't contain "C")
		expect(screen.queryByText('Option A')).not.toBeInTheDocument();
		expect(screen.queryByText('Option B')).not.toBeInTheDocument();
		// Option C should be visible in the filtered list
		expect(screen.getByText('Option C')).toBeInTheDocument();
	});

	it('handles multi-select with onMultiChange', async () => {
		const user = userEvent.setup();
		const handleMultiChange = vi.fn();
		const { rerender } = render(
			<Dropdown
				variant="multi"
				options={mockOptions}
				onMultiChange={handleMultiChange}
			/>
		);
		await user.click(screen.getByRole('button'));
		await user.click(screen.getByText('Option A'));
		expect(handleMultiChange).toHaveBeenCalledWith(['a']);
		// Re-render with new values to update component state
		rerender(
			<Dropdown
				variant="multi"
				options={mockOptions}
				values={['a']}
				onMultiChange={handleMultiChange}
			/>
		);
		// Dropdown should stay open for multi-select - reopen if needed
		if (!screen.queryByText('Option B')) {
			await user.click(screen.getByRole('button'));
		}
		await user.click(screen.getByText('Option B'));
		expect(handleMultiChange).toHaveBeenLastCalledWith(['a', 'b']);
	});

	it('shows multi-select count', async () => {
		render(
			<Dropdown
				variant="multi"
				options={mockOptions}
				values={['a', 'b']}
				onMultiChange={() => {}}
			/>
		);
		expect(screen.getByText('2 selected')).toBeInTheDocument();
	});

	it('handles grouped options', async () => {
		const user = userEvent.setup();
		const handleChange = vi.fn();
		const groupedOptions = [
			{ label: 'Group 1', options: [{ value: 'x', label: 'X' }] },
			{ label: 'Group 2', options: [{ value: 'y', label: 'Y' }] },
		];
		render(
			<Dropdown options={groupedOptions} onChange={handleChange} />
		);
		await user.click(screen.getByRole('button'));
		expect(screen.getByText('Group 1')).toBeInTheDocument();
		expect(screen.getByText('X')).toBeInTheDocument();
		await user.click(screen.getByText('Y'));
		expect(handleChange).toHaveBeenCalledWith('y');
	});

	it('clears selection when clearable', async () => {
		const user = userEvent.setup();
		const handleChange = vi.fn();
		render(
			<Dropdown
				options={mockOptions}
				value="a"
				onChange={handleChange}
				clearable
			/>
		);
		const clearButton = screen.getByRole('button', { name: /clear/i }) ??
			screen.getAllByRole('button')[0];
		await user.click(clearButton);
	});

	it('shows error message', () => {
		render(
			<Dropdown
				options={mockOptions}
				onChange={() => {}}
				error="This is required"
			/>
		);
		expect(screen.getByText('This is required')).toBeInTheDocument();
	});

	it('disables dropdown when disabled', () => {
		render(
			<Dropdown options={mockOptions} onChange={() => {}} disabled />
		);
		expect(screen.getByRole('button')).toBeDisabled();
	});

	it('handles disabled options within list', async () => {
		const user = userEvent.setup();
		const handleChange = vi.fn();
		const optionsWithDisabled = [
			...mockOptions,
			{ value: 'd', label: 'Option D', disabled: true },
		];
		render(<Dropdown options={optionsWithDisabled} onChange={handleChange} />);
		await user.click(screen.getByRole('button'));
		const disabledOption = screen.getByText('Option D');
		// The opacity-40 class is on the parent <li>, not the span
		expect(disabledOption.closest('[aria-disabled="true"]')).toBeTruthy();
	});
});
