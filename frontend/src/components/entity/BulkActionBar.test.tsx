import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BulkActionBar } from './BulkActionBar';

describe('BulkActionBar', () => {
  it('should not render when selectedCount is 0', () => {
    render(
      <BulkActionBar
        selectedCount={0}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.queryByText(/item.*selected/)).not.toBeInTheDocument();
  });

  it('should render when selectedCount is greater than 0', () => {
    render(
      <BulkActionBar
        selectedCount={3}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.getByText('3 items selected')).toBeInTheDocument();
  });

  it('should show singular "item" when count is 1', () => {
    render(
      <BulkActionBar
        selectedCount={1}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.getByText('1 item selected')).toBeInTheDocument();
  });

  it('should render Archive button when onArchive provided', () => {
    render(
      <BulkActionBar
        selectedCount={2}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.getByText('Archive')).toBeInTheDocument();
  });

  it('should not render Archive button when onArchive not provided', () => {
    render(
      <BulkActionBar
        selectedCount={2}
        onDelete={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.queryByText('Archive')).not.toBeInTheDocument();
  });

  it('should render Delete button when onDelete provided', () => {
    render(
      <BulkActionBar
        selectedCount={2}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('should render Clear (×) button with aria-label', () => {
    render(
      <BulkActionBar
        selectedCount={2}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Clear selection' })).toBeInTheDocument();
  });

  it('should call onArchive when Archive button is clicked', async () => {
    const handleArchive = vi.fn();
    render(
      <BulkActionBar
        selectedCount={2}
        onArchive={handleArchive}
        onDelete={vi.fn()}
        onClear={vi.fn()}
      />
    );
    await userEvent.click(screen.getByText('Archive'));
    expect(handleArchive).toHaveBeenCalled();
  });

  it('should call onDelete when Delete button is clicked', async () => {
    const handleDelete = vi.fn();
    render(
      <BulkActionBar
        selectedCount={2}
        onArchive={vi.fn()}
        onDelete={handleDelete}
        onClear={vi.fn()}
      />
    );
    await userEvent.click(screen.getByText('Delete'));
    expect(handleDelete).toHaveBeenCalled();
  });

  it('should call onClear when × button is clicked', async () => {
    const handleClear = vi.fn();
    render(
      <BulkActionBar
        selectedCount={2}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
        onClear={handleClear}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(handleClear).toHaveBeenCalled();
  });

  it('should disable all buttons when isLoading=true', () => {
    render(
      <BulkActionBar
        selectedCount={2}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
        onClear={vi.fn()}
        isLoading
      />
    );
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });
});
