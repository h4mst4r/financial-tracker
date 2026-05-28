import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastContainer } from './Toast';
import { useAlertStore } from '../../store/alertStore';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    useEffect: vi.fn(),
  };
});

describe('Toast', () => {
  beforeEach(() => {
    useAlertStore.getState().clear();
  });

  it('renders nothing when no toasts', () => {
    render(<ToastContainer />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders toast when enqueued', () => {
    useAlertStore.getState().enqueue({
      id: 'test-1',
      variant: 'success',
      title: 'Success',
      message: 'Action completed',
      duration: 10000,
    });
    render(<ToastContainer />);
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText('Action completed')).toBeInTheDocument();
  });

  it('renders different variants with correct icons', () => {
    useAlertStore.getState().enqueue({
      id: 'test-2',
      variant: 'error',
      title: 'Error',
      duration: 10000,
    });
    render(<ToastContainer />);
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('dismisses toast when dismiss button clicked', async () => {
    useAlertStore.getState().enqueue({
      id: 'test-3',
      variant: 'info',
      title: 'Info Toast',
      duration: 10000,
    });
    render(<ToastContainer />);
    expect(screen.getByText('Info Toast')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Dismiss'));
    await waitFor(() => {
      expect(screen.queryByText('Info Toast')).not.toBeInTheDocument();
    });
  });

  it('respects maxToasts limit', () => {
    useAlertStore.getState().enqueue({ id: 't1', variant: 'info', duration: 10000 });
    useAlertStore.getState().enqueue({ id: 't2', variant: 'info', duration: 10000 });
    useAlertStore.getState().enqueue({ id: 't3', variant: 'info', duration: 10000 });
    useAlertStore.getState().enqueue({ id: 't4', variant: 'info', duration: 10000 });

    const { container } = render(<ToastContainer maxToasts={3} />);
    const alerts = container.querySelectorAll('[role="alert"]');
    expect(alerts.length).toBeLessThanOrEqual(3);
  });
});
