import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EntityPage } from './EntityPage';

describe('EntityPage', () => {
  it('should render Create button', () => {
    render(
      <EntityPage<any>
        onCreateClick={vi.fn()}
        title="Test Page"
      >
        <div>Content</div>
      </EntityPage>
    );

    expect(screen.getByText('Create')).toBeInTheDocument();
  });

  it('should render title when provided', () => {
    render(
      <EntityPage<any>
        onCreateClick={vi.fn()}
        title="Accounts"
      >
        <div>Content</div>
      </EntityPage>
    );

    expect(screen.getByText('Accounts')).toBeInTheDocument();
  });

  it('should call onCreateClick when Create button is clicked', async () => {
    const handleCreate = vi.fn();

    await render(
      <EntityPage<any>
        onCreateClick={handleCreate}
        title="Test Page"
      >
        <div>Content</div>
      </EntityPage>
    );

    const createButton = screen.getByText('Create');
    await userEvent.click(createButton);

    expect(handleCreate).toHaveBeenCalled();
  });

  it('should render children content', () => {
    render(
      <EntityPage<any>
        onCreateClick={vi.fn()}
        title="Test Page"
      >
        <div data-testid="page-content">List or Table</div>
      </EntityPage>
    );

    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });

  it('should render extension actions slot when provided', () => {
    render(
      <EntityPage<any>
        onCreateClick={vi.fn()}
        title="Test Page"
        actions={<button data-testid="custom-action">Custom</button>}
      >
        <div>Content</div>
      </EntityPage>
    );

    expect(screen.getByTestId('custom-action')).toBeInTheDocument();
  });

  it('should render filter bar slot when showFilterBar is true', () => {
    render(
      <EntityPage<any>
        onCreateClick={vi.fn()}
        title="Test Page"
        showFilterBar={true}
      >
        <div>Content</div>
      </EntityPage>
    );

    expect(screen.getByText(/Filter bar slot/)).toBeInTheDocument();
  });

  it('should not render filter bar slot when showFilterBar is false', () => {
    render(
      <EntityPage<any>
        onCreateClick={vi.fn()}
        title="Test Page"
        showFilterBar={false}
      >
        <div>Content</div>
      </EntityPage>
    );

    expect(screen.queryByText(/Filter bar slot/)).not.toBeInTheDocument();
  });

  it('should render Show Archived toggle', () => {
    const { container } = render(
      <EntityPage<any>
        onCreateClick={vi.fn()}
        title="Test Page"
      >
        <div>Content</div>
      </EntityPage>
    );

    // Toggle uses label attribute, not accessible name
    const toggle = container.querySelector('[label="Show Archived"]');
    expect(toggle).toBeInTheDocument();
  });
});
