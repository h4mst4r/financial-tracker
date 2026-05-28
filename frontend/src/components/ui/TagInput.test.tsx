import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { TagInput } from './TagInput';

describe('TagInput', () => {
	it('renders with placeholder', () => {
		render(<TagInput onChange={() => {}} />);
		expect(screen.getByPlaceholderText('Add a tag...')).toBeInTheDocument();
	});

	it('adds tag on Enter', async () => {
		const user = userEvent.setup();
		const handleChange = vi.fn();
		render(<TagInput onChange={handleChange} />);
		const input = screen.getByPlaceholderText('Add a tag...');
		await user.type(input, 'tag1{enter}');
		expect(handleChange).toHaveBeenCalledWith(['tag1']);
	});

	it('adds tag on comma', async () => {
		const user = userEvent.setup();
		const handleChange = vi.fn();
		render(<TagInput onChange={handleChange} />);
		const input = screen.getByPlaceholderText('Add a tag...');
		// Type the tag text first, then press comma separately
		await user.type(input, 'tag1');
		await user.keyboard(',');
		expect(handleChange).toHaveBeenCalledWith(['tag1']);
	});

	it('rejects duplicate tags', async () => {
		const user = userEvent.setup();
		const handleChange = vi.fn();
		render(<TagInput value={['existing']} onChange={handleChange} />);
		const input = screen.getByRole('textbox');
		await user.type(input, 'existing{enter}');
		expect(handleChange).not.toHaveBeenCalled();
	});

	it('removes last tag on Backspace when input empty', async () => {
		const user = userEvent.setup();
		const handleChange = vi.fn();
		render(<TagInput value={['tag1', 'tag2']} onChange={handleChange} />);
		const input = screen.getByRole('textbox');
		await user.click(input);
		await user.keyboard('{Backspace}');
		expect(handleChange).toHaveBeenCalledWith(['tag1']);
	});

	it('removes tag on dismiss click', async () => {
		const user = userEvent.setup();
		const handleChange = vi.fn();
		render(<TagInput value={['tag1', 'tag2']} onChange={handleChange} />);
		// Get all dismiss buttons and click the first one (for tag1)
		const dismissButtons = screen.getAllByLabelText('Dismiss');
		await user.click(dismissButtons[0]);
		expect(handleChange).toHaveBeenCalledWith(['tag2']);
	});

	it('disables when disabled', () => {
		render(<TagInput onChange={() => {}} disabled />);
		expect(screen.getByPlaceholderText('Add a tag...')).toBeDisabled();
	});

	it('displays error', () => {
		render(<TagInput onChange={() => {}} error="Invalid tags" />);
		expect(screen.getByText('Invalid tags')).toBeInTheDocument();
	});

	it('renders existing tags as badges', () => {
		render(<TagInput value={['tag1', 'tag2']} onChange={() => {}} />);
		expect(screen.getByText('tag1')).toBeInTheDocument();
		expect(screen.getByText('tag2')).toBeInTheDocument();
	});
});
