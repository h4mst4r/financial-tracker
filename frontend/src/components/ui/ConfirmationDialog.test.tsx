import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmationDialog } from './ConfirmationDialog';

describe('ConfirmationDialog', () => {
  it('does not render when isOpen is false', () => {
    render(
      <ConfirmationDialog
        isOpen={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Confirm"
      />
    );
    expect(screen.queryByText('Confirm')).not.toBeInTheDocument();
  });

  it('renders when isOpen is true', () => {
    render(
      <ConfirmationDialog
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete Item"
        message="Are you sure?"
      />
    );
    expect(screen.getByText('Delete Item')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button clicked', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmationDialog
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        title="Confirm"
        confirmLabel="Delete"
      />
    );
    await userEvent.click(screen.getByText('Delete'));
    expect(onConfirm).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when cancel button clicked', async () => {
    const onClose = vi.fn();
    render(
      <ConfirmationDialog
        isOpen={true}
        onClose={onClose}
        onConfirm={vi.fn()}
        title="Confirm"
        cancelLabel="Cancel"
      />
    );
    await userEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders warning variant by default', () => {
    render(
      <ConfirmationDialog
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Warning"
        variant="warning"
      />
    );
    expect(screen.getByText('Warning')).toBeInTheDocument();
  });

  it('renders danger variant', () => {
    render(
      <ConfirmationDialog
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Danger"
        variant="danger"
      />
    );
    expect(screen.getByText('Danger')).toBeInTheDocument();
  });

  it('disables confirm button when isConfirming', () => {
    render(
      <ConfirmationDialog
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete Item"
        isConfirming
        confirmLabel="Confirm Delete"
      />
    );
    expect(screen.getByRole('button', { name: 'Confirm Delete' })).toBeDisabled();
  });
});
