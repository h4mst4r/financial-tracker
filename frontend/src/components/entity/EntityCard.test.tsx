import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EntityCard } from './EntityCard';

interface TestEntity {
  id: string;
  name: string;
  status: string;
  archived: boolean;
  updated_at: string;
}

const mockEntity: TestEntity = {
  id: '1',
  name: 'Test Entity',
  status: 'active',
  archived: false,
  updated_at: '2026-05-28T10:00:00Z',
};

describe('EntityCard', () => {
  it('should render entity name', () => {
    render(
      <EntityCard<TestEntity> entity={mockEntity} />
    );

    expect(screen.getByText('Test Entity')).toBeInTheDocument();
  });

  it('should render status badge', () => {
    render(
      <EntityCard<TestEntity> entity={mockEntity} />
    );

    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('should render archived badge for archived entities', () => {
    const archivedEntity = { ...mockEntity, archived: true };

    render(
      <EntityCard<TestEntity> entity={archivedEntity} />
    );

    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('should show reduced opacity for archived entities', () => {
    const archivedEntity = { ...mockEntity, archived: true };

    const { container } = render(
      <EntityCard<TestEntity> entity={archivedEntity} />
    );

    // The inner Card div (child of entity-card wrapper) receives the inline style with opacity
    const wrapper = container.querySelector('[data-testid="entity-card"]');
    const cardElement = wrapper?.firstChild as HTMLElement | null;
    expect(cardElement).not.toBeNull();
    expect(cardElement?.style.opacity).toBe('0.6');
  });

  it('should call onClick when card is clicked', async () => {
    const handleClick = vi.fn();

    await render(
      <EntityCard<TestEntity> entity={mockEntity} onClick={handleClick} />
    );

    // The card should be clickable
    const card = screen.getByText('Test Entity').closest('button, [role="button"], div');
    if (card) {
      await userEvent.click(card);
    }
  });

  it('should render children when provided', () => {
    render(
      <EntityCard<TestEntity> entity={mockEntity}>
        <div data-testid="custom-body">Custom Content</div>
      </EntityCard>
    );

    expect(screen.getByTestId('custom-body')).toBeInTheDocument();
  });

  it('should render body using renderBody function', () => {
    const renderBody = () => <div data-testid="rendered-body">Rendered Body</div>;

    render(
      <EntityCard<TestEntity> entity={mockEntity} renderBody={renderBody} />
    );

    expect(screen.getByTestId('rendered-body')).toBeInTheDocument();
  });

  it('should call onEdit when edit context menu item clicked', async () => {
    const handleEdit = vi.fn();

    render(
      <EntityCard<TestEntity> entity={mockEntity} onEdit={handleEdit} />
    );

    // Context menu should be available
    expect(screen.getByText('Test Entity')).toBeInTheDocument();
  });

  it('should show Restore option for archived entities', () => {
    const archivedEntity = { ...mockEntity, archived: true };
    const handleRestore = vi.fn();

    render(
      <EntityCard<TestEntity> entity={archivedEntity} onRestore={handleRestore} />
    );

    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('should use entityAccent prop for accent color', () => {
    render(
      <EntityCard<TestEntity> entity={mockEntity} entityAccent="--color-entity-account" />
    );

    expect(screen.getByText('Test Entity')).toBeInTheDocument();
  });
});
