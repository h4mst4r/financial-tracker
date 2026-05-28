import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
	it('renders with default primary variant', () => {
		render(<Button>Click me</Button>);
		expect(screen.getByRole('button')).toHaveTextContent('Click me');
	});

	it('applies correct variant classes', () => {
		const { container } = render(<Button variant="secondary">Secondary</Button>);
		expect(container.querySelector('button')).toHaveClass('bg-surface');
	});

	it('renders small size', () => {
		render(<Button size="sm">Small</Button>);
		const btn = screen.getByRole('button');
		expect(btn).toHaveClass('h-8');
	});

	it('renders large size', () => {
		render(<Button size="lg">Large</Button>);
		const btn = screen.getByRole('button');
		expect(btn).toHaveClass('h-12');
	});

	it('handles click', async () => {
		const onClick = vi.fn();
		render(<Button onClick={onClick}>Click</Button>);
		await userEvent.click(screen.getByRole('button'));
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	it('disables button when disabled', () => {
		render(<Button disabled>Disabled</Button>);
		expect(screen.getByRole('button')).toBeDisabled();
	});

	it('shows spinner when loading', async () => {
		render(<Button loading>Loading</Button>);
		const status = screen.getByRole('status');
		expect(status).toBeInTheDocument();
	});

	it('renders with custom className', () => {
		render(<Button className="custom-class">Custom</Button>);
		const btn = screen.getByRole('button');
		expect(btn).toHaveClass('custom-class');
	});

	it('renders danger variant', () => {
		const { container } = render(<Button variant="danger">Delete</Button>);
		expect(container.querySelector('button')).toHaveClass('bg-error-bg');
	});

	it('renders icon variant without text padding', () => {
		render(<Button variant="icon" aria-label="Icon">X</Button>);
		const btn = screen.getByRole('button');
		expect(btn).toHaveAttribute('aria-label', 'Icon');
	});
});
