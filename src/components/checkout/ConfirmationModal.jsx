// ConfirmationModal.jsx — Tema: Portales.
// Se muestra tras registrar el pedido exitosamente en el backend.
import { createPortal } from 'react-dom';
import styles from './Checkout.module.css';

export default function ConfirmationModal({ pedido, onCerrar }) {
  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot || !pedido) return null;

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-box" style={{ textAlign: 'center', maxWidth: 480 }}>
        <div className={styles.confirmIcon}>✓</div>
        <h2 style={{ marginTop: 0 }}>¡Pedido confirmado!</h2>
        <p style={{ color: 'var(--color-text-dim)' }}>
          Gracias, {pedido.nombreContacto.split(' ')[0]}. Tu pedido <strong>#{pedido.id}</strong> quedó
          registrado y está <strong>{pedido.estado}</strong>.
        </p>

        <div className={styles.reviewBlock} style={{ textAlign: 'left' }}>
          <h4>Detalle</h4>
          {pedido.detalles.map((d, i) => (
            <div key={i} className={styles.summaryItem} style={{ color: 'var(--color-text)' }}>
              <span>{d.producto.nombre} × {d.cantidad}</span>
              <span>${d.subtotal.toFixed(2)}</span>
            </div>
          ))}
          <div className="summary-row total">
            <span>Total pagado</span>
            <span>${pedido.total.toFixed(2)} MXN</span>
          </div>
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-dim)' }}>
          Enviaremos la confirmación a <strong>{pedido.emailContacto}</strong> y a{' '}
          {pedido.direccion.calle} {pedido.direccion.numero}, {pedido.direccion.ciudad}.
        </p>

        <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={onCerrar}>
          Volver al inicio
        </button>
      </div>
    </div>,
    modalRoot
  );
}
