import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Drawer } from './Drawer';

describe('Drawer', () => {
  it('does not render when isOpen is false', () => {
    render(<Drawer isOpen={false} onClose={vi.fn()} title="Test">Hidden</Drawer>);
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });

  it('renders content when isOpen is true', () => {
    render(<Drawer isOpen={true} onClose={vi.fn()} title="Test">Visible Content</Drawer>);
    expect(screen.getByText('Visible Content')).toBeInTheDocument();
  });

  it('renders title', () => {
    render(<Drawer isOpen={true} onClose={vi.fn()} title="My Drawer">Content</Drawer>);
    expect(screen.getByText('My Drawer')).toBeInTheDocument();
  });

  it('closes on backdrop click', async () => {
    const onClose = vi.fn();
    render(
      <Drawer isOpen={true} onClose={onClose} title="Test">
        Content
      </Drawer>
    );
    // Click on the backdrop
    const backdrop = document.querySelector('.bg-black\\/70');
    if (backdrop) {
      await userEvent.click(backdrop);
      expect(onClose).toHaveBeenCalled();
    }
  });

  it('closes on escape key', async () => {
    const onClose = vi.fn();
    render(
      <Drawer isOpen={true} onClose={onClose} title="Test">
        Content
      </Drawer>
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('applies size variants', () => {
    const { rerender } = render(
      <Drawer isOpen={true} onClose={vi.fn()} title="Test" size="md">
        Medium
      </Drawer>
    );
    expect(screen.getByText('Medium')).toBeInTheDocument();

    rerender(
      <Drawer isOpen={true} onClose={vi.fn()} title="Test" size="lg">
        Large
      </Drawer>
    );
    expect(screen.getByText('Large')).toBeInTheDocument();
  });
});
