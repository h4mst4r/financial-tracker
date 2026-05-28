import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton } from './Skeleton';

describe('Skeleton', () => {
  it('renders card shape', () => {
    const { container } = render(<Skeleton shape="card" />);
    const skeleton = container.firstChild;
    expect(skeleton).toBeInTheDocument();
    // Shimmer animation is on child elements
    const shimmerElements = container.querySelectorAll('.animate-shimmer');
    expect(shimmerElements.length).toBeGreaterThan(0);
  });

  it('renders table-row shape', () => {
    const { container } = render(<Skeleton shape="table-row" />);
    const skeleton = container.firstChild;
    expect(skeleton).toBeInTheDocument();
  });

  it('renders chart shape', () => {
    const { container } = render(<Skeleton shape="chart" />);
    const skeleton = container.firstChild;
    expect(skeleton).toBeInTheDocument();
  });

  it('renders stat shape', () => {
    const { container } = render(<Skeleton shape="stat" />);
    const skeleton = container.firstChild;
    expect(skeleton).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<Skeleton shape="card" className="custom-class" />);
    const skeleton = container.firstChild;
    expect(skeleton).toHaveClass('custom-class');
  });
});
