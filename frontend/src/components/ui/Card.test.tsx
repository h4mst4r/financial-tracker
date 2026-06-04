import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from './Card';

describe('Card', () => {
  it('renders default card variant', () => {
    render(<Card>Content</Card>);
    const card = screen.getByText('Content');
    expect(card).toBeInTheDocument();
    expect(card.closest('.bg-surface')).toBeTruthy();
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

  it('applies entityAccent as inline border-left style with CSS variable for color', () => {
    const { container } = render(<Card entityAccent="var(--color-entity-account)">Accent</Card>);
    const cardEl = container.firstChild as HTMLElement;
    // --entity-accent CSS var is set on the element so child utilities can read it
    expect(cardEl.style.getPropertyValue('--entity-accent')).toBe('var(--color-entity-account)');
    // border-left is an inline style (immune to cascade conflicts with Tailwind's border shorthand)
    expect(cardEl.style.borderLeft).toBe('4px solid var(--entity-accent)');
  });

  it('applies hover shadow class on stat variant', () => {
    const { container } = render(<Card variant="stat">Hoverable</Card>);
    const cardEl = container.firstChild;
    expect(cardEl).toHaveClass('hover:shadow-card');
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
