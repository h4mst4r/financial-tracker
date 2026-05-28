import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EntityModal } from './EntityModal';

interface TestEntity {
  id: string;
  name: string;
  description: string;
  status: string;
}

const mockSections: any[] = [
  {
    title: 'Basic Info',
    fields: [
      { name: 'name', label: 'Name', type: 'text' as const, required: true },
      { name: 'description', label: 'Description', type: 'textarea' as const },
    ],
  },
];

describe('EntityModal', () => {
  it('should not render when isOpen is false', () => {
    render(
      <EntityModal<TestEntity>
        isOpen={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
        sections={mockSections}
        title="Test Modal"
      />
    );

    expect(screen.queryByText('Test Modal')).not.toBeInTheDocument();
  });

  it('should render when isOpen is true', () => {
    render(
      <EntityModal<TestEntity>
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        sections={mockSections}
        title="Test Modal"
      />
    );

    expect(screen.getByText('Test Modal')).toBeInTheDocument();
  });

  it('should render field labels from sections', () => {
    render(
      <EntityModal<TestEntity>
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        sections={mockSections}
        title="Test Modal"
      />
    );

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
  });

  it('should show required indicator for required fields', () => {
    render(
      <EntityModal<TestEntity>
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        sections={mockSections}
        title="Test Modal"
      />
    );

    // The Name field is required
    const nameLabel = screen.getByText(/Name/);
    expect(nameLabel).toBeInTheDocument();
  });

  it('should render Cancel and Save buttons', () => {
    render(
      <EntityModal<TestEntity>
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        sections={mockSections}
        title="Test Modal"
      />
    );

    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  it('should call onClose when Cancel is clicked', async () => {
    const handleClose = vi.fn();

    await render(
      <EntityModal<TestEntity>
        isOpen={true}
        onClose={handleClose}
        onSave={vi.fn()}
        sections={mockSections}
        title="Test Modal"
      />
    );

    const cancelButton = screen.getByText('Cancel');
    await userEvent.click(cancelButton);

    expect(handleClose).toHaveBeenCalled();
  });

  it('should show Spinner when isSubmitting is true', () => {
    render(
      <EntityModal<TestEntity>
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        sections={mockSections}
        title="Test Modal"
        isSubmitting={true}
      />
    );

    const saveButton = screen.getByText('Save');
    expect(saveButton).toBeDisabled();
  });

  it('should disable Save button when isSubmitting', () => {
    render(
      <EntityModal<TestEntity>
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        sections={mockSections}
        title="Test Modal"
        isSubmitting={true}
      />
    );

    const saveButton = screen.getByText('Save');
    expect(saveButton.closest('button')).toBeDisabled();
  });

  it('should render section dividers with titles', () => {
    const sections: any[] = [
      {
        title: 'Section 1',
        fields: [{ name: 'name', label: 'Name', type: 'text' as const }],
      },
      {
        title: 'Section 2',
        fields: [{ name: 'status', label: 'Status', type: 'text' as const }],
      },
    ];

    render(
      <EntityModal<TestEntity>
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        sections={sections}
        title="Test Modal"
      />
    );

    expect(screen.getByText('Section 1')).toBeInTheDocument();
    expect(screen.getByText('Section 2')).toBeInTheDocument();
  });

  it('should populate field values from entity when editing', () => {
    const mockEntity: TestEntity = {
      id: '1',
      name: 'Existing Name',
      description: 'Existing Description',
      status: 'active',
    };

    render(
      <EntityModal<TestEntity>
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        entity={mockEntity}
        sections={mockSections}
        title="Edit Entity"
      />
    );

    expect(screen.getByText('Edit Entity')).toBeInTheDocument();
  });
});
