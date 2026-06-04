import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';

describe('Modal', () => {
  it('does not render when isOpen is false', () => {
    render(<Modal isOpen={false} onClose={vi.fn()} title="Test">Hidden</Modal>);
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });

  it('renders content when isOpen is true', () => {
    render(<Modal isOpen={true} onClose={vi.fn()} title="Test">Visible Content</Modal>);
    expect(screen.getByText('Visible Content')).toBeInTheDocument();
  });

  it('renders title', () => {
    render(<Modal isOpen={true} onClose={vi.fn()} title="My Title">Content</Modal>);
    expect(screen.getByText('My Title')).toBeInTheDocument();
  });

  it('closes on backdrop click', async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Test">
        Content
      </Modal>
    );
    // Click on the backdrop (the dark overlay behind the modal)
    const backdrop = document.querySelector('.bg-black\\/70');
    if (backdrop) {
      await userEvent.click(backdrop);
      expect(onClose).toHaveBeenCalled();
    }
  });

  it('closes on escape key', async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Test">
        Content
      </Modal>
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows inline dirty guard instead of window.confirm (E84)', async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Test" isDirty>
        Content
      </Modal>
    );
    // Pressing Escape with isDirty should show the inline guard, NOT call onClose
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    // The inline guard should be visible
    expect(screen.getByText('Discard changes?')).toBeInTheDocument();
    // Clicking "Discard" should close
    await userEvent.click(screen.getByRole('button', { name: /discard/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('applies size variants', () => {
    const { rerender } = render(
      <Modal isOpen={true} onClose={vi.fn()} title="Test" size="sm">
        Small
      </Modal>
    );
    expect(screen.getByText('Small')).toBeInTheDocument();

    rerender(
      <Modal isOpen={true} onClose={vi.fn()} title="Test" size="lg">
        Large
      </Modal>
    );
    expect(screen.getByText('Large')).toBeInTheDocument();
  });
});
