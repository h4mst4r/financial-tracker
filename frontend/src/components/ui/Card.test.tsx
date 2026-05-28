import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from './Card';

describe('Card', () => {
  it('renders default card variant', () => {
    render(<Card>Content</Card>);
    const card = screen.getByText('Content');
    expect(card).toBeInTheDocument();
    expect(card.closest('.card-default')).toBeTruthy();
  });

  it('renders stat variant with accent bar', () => {
    render(<Card variant="stat">Stat Content</Card>);
    const card = screen.getByText('Stat Content');
    expect(card).toBeInTheDocument();
  });

  it('renders elevated variant', () => {
    render(<Card variant="elevated">Elevated</Card>);
    const card = screen.getByText('Elevated');
    expect(card).toBeInTheDocument();
  });

  it('renders ghost variant', () => {
    render(<Card variant="ghost">Ghost</Card>);
    const card = screen.getByText('Ghost');
    expect(card).toBeInTheDocument();
  });

  it('applies entityAccent styling when provided', () => {
    const { container } = render(<Card entityAccent="--accent-income">Accent</Card>);
    const cardEl = container.firstChild;
    expect(cardEl).toHaveStyle('--accent: var(--accent-income)');
  });

  it('applies hover lift class on stat variant', () => {
    const { container } = render(<Card variant="stat">Hoverable</Card>);
    const cardEl = container.firstChild;
    expect(cardEl).toHaveClass('hover:shadow-lg');
  });

  it('applies custom className', () => {
    render(<Card className="custom-class">Custom</Card>);
    const card = screen.getByText('Custom');
    expect(card.closest('.custom-class')).toBeTruthy();
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(
      <Card onClick={handleClick} style={{ cursor: 'pointer' }}>
        Clickable
      </Card>
    );
    const card = screen.getByText('Clickable');
    card.click();
    expect(handleClick).toHaveBeenCalled();
  });
});
