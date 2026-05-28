import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState title="No Results" description="Try adjusting your filters" />);
    expect(screen.getByText('No Results')).toBeInTheDocument();
    expect(screen.getByText('Try adjusting your filters')).toBeInTheDocument();
  });

  it('renders action button with click handler', async () => {
    const handleClick = vi.fn();
    render(
      <EmptyState
        title="No Data"
        actionLabel="Add New"
        onAction={handleClick}
      />
    );
    await userEvent.click(screen.getByText('Add New'));
    expect(handleClick).toHaveBeenCalled();
  });

  it('renders filtered variant with clear filters link', async () => {
    const handleClear = vi.fn();
    render(
      <EmptyState
        title="No Results"
        isFiltered
        actionLabel="Clear filters"
        onAction={handleClear}
      />
    );
    expect(screen.getByText('Clear filters')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Clear filters'));
    expect(handleClear).toHaveBeenCalled();
  });

  it('renders icon when provided', () => {
    const { Search } = require('lucide-react');
    render(<EmptyState title="Test" icon={Search} />);
    // Should have an icon element rendered
    const svg = document.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });
});
