// LimpiarCarrito.jsx — Isla sin interfaz: vacía el carrito (vive en localStorage)
// cuando el pago ya quedó confirmado en /pago/retorno.
import { useEffect } from 'react';
import { useCartStore } from '../../store/useCartStore.js';

export default function LimpiarCarrito() {
  const vaciarCarrito = useCartStore((s) => s.vaciarCarrito);
  useEffect(() => {
    vaciarCarrito();
  }, [vaciarCarrito]);
  return null;
}
