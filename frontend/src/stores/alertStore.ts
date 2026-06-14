import { create } from 'zustand'

/** Toast notification variant */
export type ToastVariant = 'info' | 'success' | 'warning' | 'error'

/** Toast item in the queue */
export interface Toast {
  id: string
  message: string
  variant: ToastVariant
}

interface AlertState {
  panelOpen: boolean
  toasts: Toast[]
  openPanel: () => void
  closePanel: () => void
  pushToast: (toast: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
}

let nextToastId = 0

export const useAlertStore = create<AlertState>((set) => ({
  panelOpen: false,
  toasts: [],

  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),

  pushToast: (toast) =>
    set((state) => ({
      toasts: [
        ...state.toasts,
        { id: String(++nextToastId), ...toast },
      ],
    })),

  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}))
