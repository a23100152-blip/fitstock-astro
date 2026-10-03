// ReviewStep.jsx — Paso 3 del Checkout: revisión + confirmación final.
import styles from './Checkout.module.css';
import { useCartStore } from '../../store/useCartStore.js';

const METODO_LABEL = {
  tarjeta: 'Tarjeta de crédito/débito',
  paypal: 'PayPal',
  transferencia: 'Transferencia bancaria',
};

export default function ReviewStep({ datos, onRegresar, onConfirmar, enviando, errorEnvio }) {
  const items = useCartStore((s) => s.items);

  return (
    <div className={styles.panel}>
      <h3 style={{ marginTop: 0 }}>3. Revisa y confirma</h3>

      <div className={styles.reviewBlock}>
        <h4>Enviar a</h4>
        <p style={{ margin: 0 }}>{datos.nombreContacto} · {datos.emailContacto}</p>
        <p style={{ margin: '4px 0 0', color: 'var(--color-text-dim)' }}>
          {datos.calle} {datos.numero}, {datos.ciudad}, {datos.estado}, CP {datos.cp} · Tel. {datos.telefono}
        </p>
      </div>

      <div className={styles.reviewBlock}>
        <h4>Pago</h4>
        <p style={{ margin: 0 }}>
          {METODO_LABEL[datos.metodoPago]}
          {datos.metodoPago === 'tarjeta' && datos.numeroTarjeta && (
            <> · terminación {datos.numeroTarjeta.replace(/\s/g, '').slice(-4)}</>
          )}
        </p>
      </div>

      <div className={styles.reviewBlock}>
        <h4>Productos ({items.reduce((a, i) => a + i.cantidad, 0)})</h4>
        {items.map((item) => (
          <div key={item.id} className={styles.summaryItem} style={{ color: 'var(--color-text)' }}>
            <span>{item.nombre} × {item.cantidad}</span>
            <span>${(item.precio * item.cantidad).toFixed(2)}</span>
          </div>
        ))}
      </div>

      {errorEnvio && (
        <p className={styles.errorText} style={{ marginBottom: 12 }}>
          ⚠ {errorEnvio}
        </p>
      )}

      <div className={styles.actions}>
        <button type="button" className="btn btn-secondary" onClick={onRegresar} disabled={enviando}>
          ← Regresar
        </button>
        <button type="button" className="btn btn-primary" onClick={onConfirmar} disabled={enviando}>
          {enviando && <span className={styles.spinner} />}
          {enviando ? 'Registrando pedido…' : 'Confirmar y pagar'}
        </button>
      </div>
    </div>
  );
}
