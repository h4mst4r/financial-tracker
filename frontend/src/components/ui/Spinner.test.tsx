import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Spinner } from './Spinner';

describe('Spinner', () => {
	// standalone=true spinners expose role="status" to screen readers
	it('renders with default medium size', () => {
		render(<Spinner standalone />);
		const svg = screen.getByRole('status');
		expect(svg).toBeInTheDocument();
		expect(svg.querySelector('circle')).toHaveAttribute('r', '10');
	});

	it('renders small size', () => {
		render(<Spinner size="sm" standalone />);
		const svg = screen.getByRole('status');
		expect(svg.querySelector('circle')).toHaveAttribute('r', '6');
	});

	it('renders large size', () => {
		render(<Spinner size="lg" standalone />);
		const svg = screen.getByRole('status');
		expect(svg.querySelector('circle')).toHaveAttribute('r', '18');
	});

	it('has correct aria label when standalone', () => {
		render(<Spinner standalone />);
		expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading');
	});

	it('is aria-hidden by default (decorative usage inside buttons)', () => {
		const { container } = render(<Spinner />);
		expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
	});

	it('applies custom className', () => {
		const { container } = render(<Spinner className="test-class" />);
		expect(container.firstChild).toHaveClass('test-class');
	});
});
