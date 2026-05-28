import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Spinner } from './Spinner';

describe('Spinner', () => {
	it('renders with default medium size', () => {
		render(<Spinner />);
		const svg = screen.getByRole('status');
		expect(svg).toBeInTheDocument();
		expect(svg.querySelector('circle')).toHaveAttribute('r', '10');
	});

	it('renders small size', () => {
		render(<Spinner size="sm" />);
		const svg = screen.getByRole('status');
		expect(svg.querySelector('circle')).toHaveAttribute('r', '6');
	});

	it('renders large size', () => {
		render(<Spinner size="lg" />);
		const svg = screen.getByRole('status');
		expect(svg.querySelector('circle')).toHaveAttribute('r', '18');
	});

	it('has correct aria label', () => {
		render(<Spinner />);
		expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading');
	});

	it('applies custom className', () => {
		const { container } = render(<Spinner className="test-class" />);
		expect(container.firstChild).toHaveClass('test-class');
	});
});
