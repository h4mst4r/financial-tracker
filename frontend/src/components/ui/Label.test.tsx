import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Label } from './Label';

describe('Label', () => {
	it('renders label text', () => {
		render(<Label htmlFor="test">Name</Label>);
		expect(screen.getByText('Name')).toBeInTheDocument();
	});

	it('shows required asterisk', () => {
		render(<Label htmlFor="test" required>Name</Label>);
		expect(screen.getByText('*')).toBeInTheDocument();
	});

	it('displays helper text', () => {
		render(<Label htmlFor="test" helper="Enter your name">Name</Label>);
		expect(screen.getByText('Enter your name')).toBeInTheDocument();
	});

	it('displays error text with AlertCircle icon', () => {
		render(<Label htmlFor="test" error="Invalid">Name</Label>);
		expect(screen.getByText('Invalid')).toBeInTheDocument();
	});

	it('passes htmlFor prop', () => {
		const { container } = render(<Label htmlFor="field">Test</Label>);
		expect(container.querySelector('label')).toHaveAttribute('for', 'field');
	});
});
