import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ColourPicker } from './ColourPicker';

describe('ColourPicker', () => {
	it('renders with default colour', () => {
		render(<ColourPicker onChange={() => {}} />);
		expect(screen.getByText('#6366f1')).toBeInTheDocument();
	});

	it('renders controlled value', () => {
		render(<ColourPicker value="#ff0000" onChange={() => {}} />);
		expect(screen.getByText('#ff0000')).toBeInTheDocument();
	});

	it('opens palette on click', async () => {
		const user = userEvent.setup();
		render(<ColourPicker onChange={() => {}} />);
		await user.click(screen.getByRole('button'));
		await waitFor(() => {
			expect(screen.getByText('Palette')).toBeInTheDocument();
		});
	});

	it('selects swatch from palette', async () => {
		const user = userEvent.setup();
		const handleChange = vi.fn();
		render(<ColourPicker onChange={handleChange} />);
		await user.click(screen.getByRole('button'));
		const swatches = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-label')?.startsWith('Select'));
		if (swatches.length > 0) {
			await user.click(swatches[0]);
			expect(handleChange).toHaveBeenCalled();
		}
	});

	it('switches to hex mode', async () => {
		const user = userEvent.setup();
		render(<ColourPicker onChange={() => {}} />);
		await user.click(screen.getByRole('button'));
		await user.click(screen.getByText('Hex'));
		const hexInput = screen.getByPlaceholderText('#RRGGBB');
		expect(hexInput).toBeInTheDocument();
	});

	it('validates hex input on blur', async () => {
		const user = userEvent.setup();
		const handleChange = vi.fn();
		render(<ColourPicker value="#6366f1" onChange={handleChange} />);
		await user.click(screen.getByRole('button'));
		await user.click(screen.getByText('Hex'));
		const hexInput = screen.getByPlaceholderText('#RRGGBB') as HTMLInputElement;
		await userEvent.clear(hexInput);
		await user.type(hexInput, 'invalid');
		hexInput.blur();
		await waitFor(() => {
			expect((screen.getByPlaceholderText('#RRGGBB') as HTMLInputElement).value).toBe('#6366f1');
		});
	});

	it('disables when disabled', () => {
		render(<ColourPicker onChange={() => {}} disabled />);
		expect(screen.getByRole('button')).toBeDisabled();
	});

	it('renders 32 swatches in palette mode', async () => {
		const user = userEvent.setup();
		render(<ColourPicker onChange={() => {}} />);
		await user.click(screen.getByRole('button'));
		const swatches = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-label')?.startsWith('Select'));
		expect(swatches).toHaveLength(32);
	});
});
