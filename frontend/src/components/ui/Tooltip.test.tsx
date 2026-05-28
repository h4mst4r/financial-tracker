import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { Tooltip } from './Tooltip';

describe('Tooltip', () => {
	it('does not show tooltip immediately on hover', async () => {
		render(
			<Tooltip content="Info" delay={100}>
				<span>Hover me</span>
			</Tooltip>
		);
		const trigger = screen.getByText('Hover me');
		await userEvent.hover(trigger);
		// Check before delay expires
		expect(screen.queryByText('Info')).not.toBeInTheDocument();
	});

	it('shows tooltip after delay', async () => {
		render(
			<Tooltip content="Info" delay={50}>
				<span>Hover me</span>
			</Tooltip>
		);
		const trigger = screen.getByText('Hover me');
		await userEvent.hover(trigger);
		await waitFor(() => {
			expect(screen.getByText('Info')).toBeInTheDocument();
		}, { timeout: 500 });
	});

	it('hides tooltip on mouse leave', async () => {
		render(
			<Tooltip content="Info" delay={50}>
				<span>Hover me</span>
			</Tooltip>
		);
		const trigger = screen.getByText('Hover me');
		await userEvent.hover(trigger);
		await waitFor(() => {
			expect(screen.getByText('Info')).toBeInTheDocument();
		}, { timeout: 500 });
		await userEvent.unhover(trigger);
		await waitFor(() => {
			expect(screen.queryByText('Info')).not.toBeInTheDocument();
		}, { timeout: 500 });
	});

	it('dismisses tooltip on Escape key', async () => {
		render(
			<Tooltip content="Info" delay={50}>
				<span>Hover me</span>
			</Tooltip>
		);
		const trigger = screen.getByText('Hover me');
		await userEvent.hover(trigger);
		await waitFor(() => {
			expect(screen.getByText('Info')).toBeInTheDocument();
		}, { timeout: 500 });
		await userEvent.keyboard('{Escape}');
		await waitFor(() => {
			expect(screen.queryByText('Info')).not.toBeInTheDocument();
		}, { timeout: 500 });
	});

	it('shows tooltip on focus', async () => {
		render(
			<Tooltip content="Info" delay={50}>
				<button type="button">Focus me</button>
			</Tooltip>
		);
		const trigger = screen.getByText('Focus me');
		await userEvent.click(trigger); // click focuses the button
		await waitFor(() => {
			expect(screen.getByText('Info')).toBeInTheDocument();
		}, { timeout: 500 });
	});
});
