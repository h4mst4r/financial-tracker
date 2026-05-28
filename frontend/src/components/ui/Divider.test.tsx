import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Divider } from './Divider';

describe('Divider', () => {
	it('renders horizontal divider by default', () => {
		const { container } = render(<Divider />);
		expect(container.querySelector('hr')).toBeInTheDocument();
	});

	it('renders vertical divider', () => {
		const { container } = render(<Divider orientation="vertical" />);
		const hr = container.querySelector('hr');
		expect(hr).not.toBeInTheDocument();
	});

	it('renders labelled divider with label text', () => {
		render(<Divider label="SECTION" />);
		expect(screen.getByText('SECTION')).toBeInTheDocument();
	});

	it('labelled divider has two flex-grow lines', () => {
		const { container } = render(<Divider label="SEP" />);
		const flexLines = container.querySelectorAll('.flex-grow');
		expect(flexLines).toHaveLength(2);
	});

	it('applies light variant classes', () => {
		render(<Divider variant="light" />);
		const hr = document.querySelector('hr.my-3');
		expect(hr).toBeInTheDocument();
	});

	it('applies custom className', () => {
		render(<Divider className="custom-class" />);
		const hr = document.querySelector('hr.custom-class');
		expect(hr).toBeInTheDocument();
	});
});
