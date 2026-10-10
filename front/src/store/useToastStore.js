// useToastStore.js — Reemplaza al ToastContext original.
// Context API no cruza islas de Astro (cada isla es su propio árbol de React),
// así que las notificaciones viven en un store y <ToastHost/> las dibuja.
import { create } from 'zustand';

export const useToastStore = create((set) => ({
  toasts: [],
  showToast: (mensaje, tipo = 'info') => {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts, { id, mensaje, tipo }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 2600);
  },
}));

// Misma API que tenía el ToastContext: const { showToast } = useToast();
export function useToast() {
  const showToast = useToastStore((s) => s.showToast);
  return { showToast };
}
