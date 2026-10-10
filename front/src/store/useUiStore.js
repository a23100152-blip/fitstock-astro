// useUiStore.js — Estado de UI compartido entre islas (abrir/cerrar el carrito).
// Las islas de Astro son raíces de React independientes: no comparten Context,
// pero SÍ comparten módulos, por eso un store de Zustand funciona entre islas.
import { create } from 'zustand';

export const useUiStore = create((set) => ({
  cartOpen: false,
  openCart: () => set({ cartOpen: true }),
  closeCart: () => set({ cartOpen: false }),
}));
