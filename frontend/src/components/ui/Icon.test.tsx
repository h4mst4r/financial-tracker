import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Icon } from './Icon';
import { Home } from 'lucide-react';

describe('Icon', () => {
	it('renders lucide icon', () => {
		render(<Icon icon={Home} decorative />);
		const svg = document.querySelector('svg');
		expect(svg).toBeInTheDocument();
	});

	it('is decorative by default with aria-hidden', () => {
		render(<Icon icon={Home} />);
		const svg = document.querySelector('svg');
		expect(svg).toHaveAttribute('aria-hidden', 'true');
	});

	it('applies aria-label when not decorative', () => {
		render(<Icon icon={Home} decorative={false} aria-label="Home" />);
		const svg = document.querySelector('svg');
		expect(svg).toHaveAttribute('aria-label', 'Home');
		expect(svg).not.toHaveAttribute('aria-hidden');
	});

	it('renders small size', () => {
		render(<Icon icon={Home} size="sm" decorative />);
		const svg = document.querySelector('svg');
		expect(svg).toHaveAttribute('width', '16');
	});

	it('renders extra large size', () => {
		render(<Icon icon={Home} size="xl" decorative />);
		const svg = document.querySelector('svg');
		expect(svg).toHaveAttribute('width', '32');
	});

	it('applies custom className', () => {
		render(<Icon icon={Home} className="test-class" decorative />);
		const svg = document.querySelector('svg');
		expect(svg).toHaveClass('test-class');
	});
});
