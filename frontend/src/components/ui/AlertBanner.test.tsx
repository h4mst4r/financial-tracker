import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlertBanner } from './AlertBanner';

describe('AlertBanner', () => {
  it('renders with title', () => {
    render(<AlertBanner variant="info" title="Info Message" />);
    expect(screen.getByText('Info Message')).toBeInTheDocument();
  });

  it('renders all variants', () => {
    const { rerender } = render(<AlertBanner variant="success" title="Success" />);
    expect(screen.getByText('Success')).toBeInTheDocument();

    rerender(<AlertBanner variant="warning" title="Warning" />);
    expect(screen.getByText('Warning')).toBeInTheDocument();

    rerender(<AlertBanner variant="error" title="Error" />);
    expect(screen.getByText('Error')).toBeInTheDocument();

    rerender(<AlertBanner variant="info" title="Info" />);
    expect(screen.getByText('Info')).toBeInTheDocument();
  });

  it('calls dismiss handler when dismiss button clicked', async () => {
    const onDismiss = vi.fn();
    render(<AlertBanner variant="info" title="Dismissible" onDismiss={onDismiss} />);
    await userEvent.click(screen.getByLabelText('Dismiss'));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('renders description when provided', () => {
    render(
      <AlertBanner variant="info" title="Title" message="Description text" />
    );
    expect(screen.getByText('Description text')).toBeInTheDocument();
  });
});
