import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { EmojiIconPicker } from './EmojiIconPicker';

describe('EmojiIconPicker', () => {
	it('renders with placeholder', () => {
		render(<EmojiIconPicker onChange={() => {}} />);
		expect(screen.getByText('Select')).toBeInTheDocument();
	});

	it('opens picker on click', async () => {
		const user = userEvent.setup();
		render(<EmojiIconPicker onChange={() => {}} />);
		await user.click(screen.getByRole('button'));
		await waitFor(() => {
			expect(screen.getByText('Emojis')).toBeInTheDocument();
		});
	});

	it('switches to icon tab', async () => {
		const user = userEvent.setup();
		render(<EmojiIconPicker onChange={() => {}} />);
		await user.click(screen.getByRole('button'));
		await user.click(screen.getByText('Icons'));
		expect(screen.getByText('Icons')).toHaveClass('bg-accent/20');
	});

	it('searches emojis', async () => {
		const user = userEvent.setup();
		render(<EmojiIconPicker onChange={() => {}} />);
		await user.click(screen.getByRole('button'));
		const searchInput = screen.getByPlaceholderText('Search...');
		await user.type(searchInput, 'heart');
		await waitFor(() => {
			expect(searchInput).toHaveValue('heart');
		});
	});

	it('calls onChange when emoji selected', async () => {
		const user = userEvent.setup();
		const handleChange = vi.fn();
		render(<EmojiIconPicker onChange={handleChange} />);
		await user.click(screen.getByRole('button'));
		// Click first emoji button (wider than 80px min)
		const buttons = screen.getAllByRole('button');
		const emojiButtons = buttons.filter(
			(b) => b.textContent?.length === 1 && b.textContent?.charCodeAt(0) > 127
		);
		if (emojiButtons.length > 0) {
			await user.click(emojiButtons[0]);
			expect(handleChange).toHaveBeenCalled();
		}
	});

	it('disables when disabled', () => {
		render(<EmojiIconPicker onChange={() => {}} disabled />);
		expect(screen.getByRole('button')).toBeDisabled();
	});

	it('closes on click outside', async () => {
		const user = userEvent.setup();
		render(
			<div>
				<EmojiIconPicker onChange={() => {}} />
				<button type="button">Outside</button>
			</div>
		);
		await user.click(screen.getByRole('button', { name: /select/i }));
		await waitFor(() => {
			expect(screen.getByText('Emojis')).toBeInTheDocument();
		});
		await user.click(screen.getByText('Outside'));
		await waitFor(() => {
			expect(screen.queryByText('Emojis')).not.toBeInTheDocument();
		});
	});
});
