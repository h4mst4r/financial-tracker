import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Avatar, AvatarStack } from './Avatar';

describe('Avatar', () => {
	it('renders initials from name', () => {
		render(<Avatar name="John Doe" />);
		expect(screen.getByRole('img')).toHaveTextContent('JD');
	});

	it('renders single initial for single word', () => {
		render(<Avatar name="Alice" />);
		expect(screen.getByRole('img')).toHaveTextContent('AL');
	});

	it('shows question mark when no name', () => {
		render(<Avatar />);
		expect(screen.getByRole('img')).toHaveTextContent('?');
	});

	it('renders image when pictureUrl provided', () => {
		render(<Avatar pictureUrl="/avatar.png" name="Test" />);
		const img = screen.getByRole('img') as HTMLImageElement;
		expect(img.src).toContain('/avatar.png');
	});

	it('applies archived classes', () => {
		render(<Avatar name="Old" archived />);
		expect(screen.getByRole('img')).toHaveClass('grayscale');
	});

	it('renders small size', () => {
		render(<Avatar name="SM" size="sm" />);
		const el = screen.getByRole('img');
		expect(el).toHaveAttribute('aria-label', 'SM');
	});
});

describe('AvatarStack', () => {
	it('renders multiple avatars', () => {
		render(
			<AvatarStack
				avatars={[
					{ name: 'Alice' },
					{ name: 'Bob' },
				]}
			/>
		);
		expect(screen.getByText('AL')).toBeInTheDocument();
	});

	it('shows overflow badge', () => {
		render(
			<AvatarStack
				maxVisible={2}
				avatars={[
					{ name: 'A' },
					{ name: 'B' },
					{ name: 'C' },
					{ name: 'D' },
				]}
			/>
		);
		expect(screen.getByText('+2')).toBeInTheDocument();
	});

	it('shows overflow aria label', () => {
		render(
			<AvatarStack
				maxVisible={1}
				avatars={[
					{ name: 'A' },
					{ name: 'B' },
					{ name: 'C' },
				]}
			/>
		);
		expect(screen.getByLabelText('2 more')).toBeInTheDocument();
	});
});
