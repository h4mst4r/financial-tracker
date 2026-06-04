import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Badge } from './Badge';

describe('Badge', () => {
	it('renders badge text', () => {
		render(<Badge>Label</Badge>);
		expect(screen.getByText('Label')).toBeInTheDocument();
	});

	it('applies variant classes', () => {
		const { container } = render(<Badge variant="success">Success</Badge>);
		expect(container.querySelector('span')).toHaveClass('bg-success-muted');
	});

	it('renders all variants without error', () => {
		render(<Badge variant="warning">Warning</Badge>);
		render(<Badge variant="error">Error</Badge>);
		render(<Badge variant="info">Info</Badge>);
		render(<Badge variant="neutral">Neutral</Badge>);
		render(<Badge variant="entity">Entity</Badge>);
		expect(screen.getAllByText('Warning')).toHaveLength(1);
	});

	it('applies entity accent via CSS variable and utility classes', () => {
		const { container } = render(<Badge variant="entity" entityAccent="#6366f1">Tag</Badge>);
		const badge = container.querySelector('span') as HTMLElement;
		// --entity-accent CSS var is set on the element; utility classes read it
		expect(badge.style.getPropertyValue('--entity-accent')).toBe('#6366f1');
		expect(badge).toHaveClass('bg-entity-accent-muted');
		expect(badge).toHaveClass('text-entity-accent');
	});

	it('calls onDismiss when dismissible', async () => {
		const onDismiss = vi.fn();
		render(<Badge dismissible onDismiss={onDismiss}>Chip</Badge>);
		await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
		expect(onDismiss).toHaveBeenCalledTimes(1);
	});

	it('stops propagation on dismiss click', async () => {
		const onBadgeClick = vi.fn();
		const onDismiss = vi.fn();
		render(
			<Badge dismissible onDismiss={onDismiss} onClick={onBadgeClick}>
				Chip
			</Badge>
		);
		await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
		expect(onDismiss).toHaveBeenCalled();
		// Dismiss button uses stopPropagation internally so badge click won't fire
		expect(onBadgeClick).not.toHaveBeenCalled();
	});
});
