import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  action?: { label: string; run: () => void };
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'>) => string;
  dismiss: (id: string) => void;
}

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) => {
    const id = `toast_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }].slice(-4) }));
    const ttl = toast.kind === 'error' ? 7000 : 3800;
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }));
    }, ttl);
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) })),
}));

export const toast = {
  info: (message: string) => useToasts.getState().push({ kind: 'info', message }),
  success: (message: string) => useToasts.getState().push({ kind: 'success', message }),
  warning: (message: string) => useToasts.getState().push({ kind: 'warning', message }),
  error: (message: string) => useToasts.getState().push({ kind: 'error', message }),
};
