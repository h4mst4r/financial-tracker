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
        onClearSelection={vi.fn()}
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
        onClearSelection={vi.fn()}
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
        onClearSelection={vi.fn()}
      />
    );

    expect(screen.getByText('1 item selected')).toBeInTheDocument();
  });

  it('should render Archive button', () => {
    render(
      <BulkActionBar
        selectedCount={2}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
        onClearSelection={vi.fn()}
      />
    );

    expect(screen.getByText('Archive')).toBeInTheDocument();
  });

  it('should render Delete button', () => {
    render(
      <BulkActionBar
        selectedCount={2}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
        onClearSelection={vi.fn()}
      />
    );

    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('should render Clear button', () => {
    render(
      <BulkActionBar
        selectedCount={2}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
        onClearSelection={vi.fn()}
      />
    );

    expect(screen.getByText('Clear')).toBeInTheDocument();
  });

  it('should call onArchive when Archive button is clicked', async () => {
    const handleArchive = vi.fn();

    await render(
      <BulkActionBar
        selectedCount={2}
        onArchive={handleArchive}
        onDelete={vi.fn()}
        onClearSelection={vi.fn()}
      />
    );

    const archiveButton = screen.getByText('Archive');
    await userEvent.click(archiveButton);

    expect(handleArchive).toHaveBeenCalled();
  });

  it('should call onDelete when Delete button is clicked', async () => {
    const handleDelete = vi.fn();

    await render(
      <BulkActionBar
        selectedCount={2}
        onArchive={vi.fn()}
        onDelete={handleDelete}
        onClearSelection={vi.fn()}
      />
    );

    const deleteButton = screen.getByText('Delete');
    await userEvent.click(deleteButton);

    expect(handleDelete).toHaveBeenCalled();
  });

  it('should call onClearSelection when Clear button is clicked', async () => {
    const handleClear = vi.fn();

    await render(
      <BulkActionBar
        selectedCount={2}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
        onClearSelection={handleClear}
      />
    );

    const clearButton = screen.getByText('Clear');
    await userEvent.click(clearButton);

    expect(handleClear).toHaveBeenCalled();
  });
});
