import { useMemo } from 'react';
import { useCartStore } from '../store/useCartStore';

export function useCartTotals() {
  const items = useCartStore((state) => state.items);

  const { subtotal, totalItems, totalConEnvio } = useMemo(() => {
    const subtotal = items.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
    const totalItems = items.reduce((acc, i) => acc + i.cantidad, 0);
    const envio = subtotal > 0 && subtotal < 999 ? 99 : 0;
    const totalConEnvio = subtotal + envio;

    return { subtotal, totalItems, totalConEnvio, envio };
  }, [items]);

  return { subtotal, totalItems, totalConEnvio };
}