import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContextMenu } from './ContextMenu';

describe('ContextMenu', () => {
  const items = [
    { label: 'Edit', onClick: vi.fn() },
    { label: 'Delete', onClick: vi.fn(), destructive: true },
  ];

  it('opens menu when trigger clicked', async () => {
    render(<ContextMenu items={items} />);
    const trigger = screen.getByRole('button');
    await userEvent.click(trigger);
    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });
  });

  it('calls onClick when menu item clicked', async () => {
    const editHandler = vi.fn();
    render(<ContextMenu items={[{ label: 'Edit', onClick: editHandler }]} />);
    await userEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText('Edit'));
    expect(editHandler).toHaveBeenCalled();
  });

  it('renders disabled items', async () => {
    render(
      <ContextMenu
        items={[{ label: 'Disabled', onClick: vi.fn(), disabled: true }]}
      />
    );
    await userEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByText('Disabled')).toBeInTheDocument();
      expect(screen.getByRole('menuitem')).toBeDisabled();
    });
  });

  it('renders destructive items with error styling', async () => {
    render(<ContextMenu items={items} />);
    await userEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      const deleteButtons = screen.getAllByText('Delete');
      expect(deleteButtons.length).toBeGreaterThan(0);
      // The button parent has the text-error class
      const deleteButton = deleteButtons[0].closest('button');
      expect(deleteButton).toHaveClass('text-error');
    });
  });

  it('closes on escape key', async () => {
    render(<ContextMenu items={items} />);
    await userEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    });
  });

  it('renders divider items', async () => {
    const itemsWithDivider = [
      { label: 'Edit', onClick: vi.fn() },
      { divider: true },
      { label: 'Delete', onClick: vi.fn(), destructive: true },
    ];
    render(<ContextMenu items={itemsWithDivider} />);
    await userEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      const dividers = document.querySelectorAll('.border-t');
      expect(dividers.length).toBeGreaterThan(0);
    });
  });
});
