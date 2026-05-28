import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
	it('renders unchecked by default', () => {
		render(<Checkbox />);
		const input = screen.getByRole('checkbox');
		expect(input).not.toBeChecked();
	});

	it('renders checked when checked=true', () => {
		render(<Checkbox checked />);
		expect(screen.getByRole('checkbox')).toBeChecked();
	});

	it('calls onChange when clicked', async () => {
		const user = userEvent.setup();
		const handleChange = vi.fn();
		render(<Checkbox onChange={handleChange} />);
		await user.click(screen.getByRole('checkbox'));
		expect(handleChange).toHaveBeenCalledWith(true);
	});

	it('renders indeterminate state', () => {
		render(<Checkbox indeterminate />);
		const checkbox = screen.getByRole('checkbox');
		expect(checkbox).toHaveAttribute('aria-checked', 'mixed');
	});

	it('disables when disabled', () => {
		render(<Checkbox disabled />);
		expect(screen.getByRole('checkbox')).toBeDisabled();
	});

	it('renders with label text', () => {
		render(<Checkbox>Accept terms</Checkbox>);
		expect(screen.getByText('Accept terms')).toBeInTheDocument();
	});

	it('applies custom className', () => {
		render(<Checkbox className="custom-class" />);
		const label = screen.getByRole('checkbox').closest('label');
		expect(label).toHaveClass('custom-class');
	});
});
