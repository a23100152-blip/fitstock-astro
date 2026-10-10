// OrderSummarySidebar.jsx — Resumen fijo del pedido, visible en los 3 pasos.
import styles from './Checkout.module.css';
import { useCartStore } from '../../store/useCartStore.js';

const COSTO_ENVIO = 99;
const ENVIO_GRATIS_DESDE = 999;

export default function OrderSummarySidebar() {
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore((s) => s.subtotal());
  const envio = subtotal >= ENVIO_GRATIS_DESDE ? 0 : COSTO_ENVIO;
  const total = subtotal + envio;

  return (
    <aside className={styles.summaryCard}>
      <h3 style={{ marginTop: 0 }}>Resumen del pedido</h3>
      {items.map((item) => (
        <div key={item.id} className={styles.summaryItem}>
          <span>{item.nombre} × {item.cantidad}</span>
          <span>${(item.precio * item.cantidad).toFixed(2)}</span>
        </div>
      ))}
      <div className="summary-row">
        <span>Subtotal</span>
        <span>${subtotal.toFixed(2)}</span>
      </div>
      <div className="summary-row">
        <span>Envío</span>
        <span>{envio === 0 ? 'Gratis' : `$${envio.toFixed(2)}`}</span>
      </div>
      <div className="summary-row total">
        <span>Total</span>
        <span>${total.toFixed(2)} MXN</span>
      </div>
      {envio > 0 && (
        <p style={{ fontSize: '0.78rem', color: 'var(--color-text-dim)', marginTop: 8 }}>
          Te faltan ${(ENVIO_GRATIS_DESDE - subtotal).toFixed(2)} para envío gratis.
        </p>
      )}
    </aside>
  );
}
