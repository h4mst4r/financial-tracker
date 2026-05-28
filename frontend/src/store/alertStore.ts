import { create } from 'zustand';

export interface Toast {
  id: string;
  variant: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message?: string;
  duration?: number;
}

interface AlertState {
  toasts: Toast[];
  enqueue: (toast: Omit<Toast, 'id'>) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const DEFAULT_DURATION = {
  success: 4000,
  info: 4000,
  error: 8000,
  warning: 8000,
};

let nextId = 0;

export const useAlertStore = create<AlertState>((set) => ({
  toasts: [],
  enqueue: (toast) => {
    const id = `toast-${++nextId}`;
    const newToast: Toast = {
      ...toast,
      id,
      duration: toast.duration ?? DEFAULT_DURATION[toast.variant],
    };
    set((state) => ({
      toasts: [...state.toasts.slice(-2), newToast], // Keep max 3 (2 existing + 1 new)
    }));
    return id;
  },
  dismiss: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
  clear: () => {
    set({ toasts: [] });
  },
}));
