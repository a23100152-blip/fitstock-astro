import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Store del carrito — la parte que se hizo robusta desde el equipo del
// carrito. Guarda solo el estado crudo (qué hay, cuánto de cada uno);
// los cálculos derivados (subtotal, envío, total) viven en el hook
// useCartTotals o en los selectores de abajo.
//
// Incluye alias en español (agregarItem, quitarItem, actualizarCantidad,
// vaciarCarrito, subtotal(), totalItems()) para que el Checkout multi-paso
// (construido por otro integrante contra esos nombres) funcione tal cual,
// sin duplicar un segundo store del carrito.
// persist: en Astro cada ruta es una página distinta (MPA), así que el carrito
// se guarda en localStorage para sobrevivir a la navegación entre páginas.
export const useCartStore = create(
  persist(
    (set, get) => ({
  items: [], // { id, nombre, precio, stock, imagenUrl, cantidad }

  addItem: (producto, cantidad = 1) => {
    const items = get().items;
    const existente = items.find((i) => i.id === producto.id);
    const tope = producto.stock ?? Infinity;

    if (existente) {
      set({
        items: items.map((i) =>
          i.id === producto.id
            ? { ...i, cantidad: Math.min(i.cantidad + cantidad, tope) }
            : i
        ),
      });
    } else {
      set({
        items: [
          ...items,
          {
            id: producto.id,
            nombre: producto.nombre,
            precio: producto.precio,
            stock: producto.stock,
            imagenUrl: producto.imagenUrl,
            cantidad: Math.min(cantidad, tope),
          },
        ],
      });
    }
  },

  removeItem: (id) => {
    set({ items: get().items.filter((i) => i.id !== id) });
  },

  updateQty: (id, cantidad) => {
    if (cantidad <= 0) {
      get().removeItem(id);
      return;
    }
    set({
      items: get().items.map((i) =>
        i.id === id ? { ...i, cantidad: Math.min(cantidad, i.stock ?? Infinity) } : i
      ),
    });
  },

  clearCart: () => set({ items: [] }),

  getTotal: () => get().items.reduce((acc, i) => acc + i.precio * i.cantidad, 0),
  getCount: () => get().items.reduce((acc, i) => acc + i.cantidad, 0),

  // ---- Alias en español (usados por el Checkout) ----
  agregarItem(producto, cantidad = 1) {
    return get().addItem(producto, cantidad);
  },
  quitarItem(id) {
    return get().removeItem(id);
  },
  actualizarCantidad(id, cantidad) {
    return get().updateQty(id, cantidad);
  },
  vaciarCarrito() {
    return get().clearCart();
  },
  subtotal() {
    return get().getTotal();
  },
  totalItems() {
    return get().getCount();
  },
}),
    { name: 'fitstock-cart', partialize: (state) => ({ items: state.items }) }
  )
);
