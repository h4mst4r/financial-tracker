import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Toggle } from './Toggle';

describe('Toggle', () => {
	it('renders unchecked by default', () => {
		render(<Toggle />);
		const toggle = screen.getByRole('switch');
		expect(toggle).toHaveAttribute('aria-checked', 'false');
	});

	it('renders checked when checked=true', () => {
		render(<Toggle checked />);
		expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
	});

	it('calls onChange when clicked', async () => {
		const user = userEvent.setup();
		const handleChange = vi.fn();
		render(<Toggle onChange={handleChange} />);
		await user.click(screen.getByRole('switch'));
		expect(handleChange).toHaveBeenCalledWith(true);
	});

	it('toggles from checked to unchecked', async () => {
		const user = userEvent.setup();
		const handleChange = vi.fn();
		render(<Toggle checked onChange={handleChange} />);
		await user.click(screen.getByRole('switch'));
		expect(handleChange).toHaveBeenCalledWith(false);
	});

	it('disables when disabled', () => {
		render(<Toggle disabled />);
		const toggle = screen.getByRole('switch');
		expect(toggle).toHaveAttribute('aria-disabled', 'true');
	});

	it('does not call onChange when disabled', async () => {
		const user = userEvent.setup();
		const handleChange = vi.fn();
		render(<Toggle disabled onChange={handleChange} />);
		await user.click(screen.getByRole('switch'));
		expect(handleChange).not.toHaveBeenCalled();
	});

	it('toggles on space key', async () => {
		const user = userEvent.setup();
		const handleChange = vi.fn();
		render(<Toggle onChange={handleChange} />);
		screen.getByRole('switch').focus();
		await user.keyboard(' ');
		expect(handleChange).toHaveBeenCalledWith(true);
	});

	it('toggles on enter key', async () => {
		const user = userEvent.setup();
		const handleChange = vi.fn();
		render(<Toggle onChange={handleChange} />);
		const toggle = screen.getByRole('switch');
		toggle.focus();
		await user.keyboard('{Enter}');
		expect(handleChange).toHaveBeenCalledWith(true);
	});

	it('applies custom className', () => {
		render(<Toggle className="custom-class" />);
		expect(screen.getByRole('switch')).toHaveClass('custom-class');
	});
});
