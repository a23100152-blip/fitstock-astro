// PaymentStep.jsx — Paso 2 del Checkout: método de pago.
// Métodos de cobro:
//  - PayPal y Mercado Pago: pasarelas reales (sandbox) — al confirmar el pedido se
//    redirige al cliente a la pasarela y se verifica el pago al regresar.
//  - Tarjeta: sigue siendo un cobro simulado (solo valida el formato).
//  - Transferencia: queda pendiente hasta que el administrador confirma el depósito.
import styles from './Checkout.module.css';

const METODOS = [
  { id: 'tarjeta', label: 'Tarjeta de crédito/débito', icono: '💳' },
  { id: 'paypal', label: 'PayPal', icono: '🅿️' },
  { id: 'mercadopago', label: 'Mercado Pago', icono: '🤝' },
  { id: 'transferencia', label: 'Transferencia bancaria', icono: '🏦' },
];

export function validarPago(datos) {
  const errores = {};
  if (!datos.metodoPago) {
    errores.metodoPago = 'Selecciona un método de pago.';
    return errores;
  }
  if (datos.metodoPago === 'tarjeta') {
    if (!/^\d{16}$/.test((datos.numeroTarjeta || '').replace(/\s/g, ''))) {
      errores.numeroTarjeta = 'La tarjeta debe tener 16 dígitos.';
    }
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(datos.vencimiento || '')) {
      errores.vencimiento = 'Formato MM/AA.';
    }
    if (!/^\d{3,4}$/.test(datos.cvv || '')) {
      errores.cvv = 'CVV inválido.';
    }
    if (!datos.nombreTarjeta?.trim()) {
      errores.nombreTarjeta = 'Ingresa el nombre tal como aparece en la tarjeta.';
    }
  }
  return errores;
}

export default function PaymentStep({ datos, errores, onChange, onContinuar, onRegresar }) {
  const campo = (name) => ({
    value: datos[name] || '',
    onChange: (e) => onChange(name, e.target.value),
  });

  return (
    <div className={styles.panel}>
      <h3 style={{ marginTop: 0 }}>2. Método de pago</h3>

      <div className={styles.paymentOptions}>
        {METODOS.map((m) => (
          <label
            key={m.id}
            className={`${styles.paymentOption} ${datos.metodoPago === m.id ? styles.paymentOptionSelected : ''}`}
          >
            <input
              type="radio"
              name="metodoPago"
              value={m.id}
              checked={datos.metodoPago === m.id}
              onChange={(e) => onChange('metodoPago', e.target.value)}
            />
            <span>{m.icono}</span>
            <span>{m.label}</span>
          </label>
        ))}
      </div>
      {errores.metodoPago && <p className={styles.errorText}>{errores.metodoPago}</p>}

      {datos.metodoPago === 'tarjeta' && (
        <div className={styles.formGrid}>
          <div className={`${styles.field} ${errores.nombreTarjeta ? styles.fieldError : ''} ${styles.fieldFull}`}>
            <label>Nombre en la tarjeta</label>
            <input {...campo('nombreTarjeta')} placeholder="MATIAS GOMEZ" />
            {errores.nombreTarjeta && <span className={styles.errorText}>{errores.nombreTarjeta}</span>}
          </div>
          <div className={`${styles.field} ${errores.numeroTarjeta ? styles.fieldError : ''} ${styles.fieldFull}`}>
            <label>Número de tarjeta</label>
            <input {...campo('numeroTarjeta')} placeholder="4111 1111 1111 1111" maxLength={19} />
            {errores.numeroTarjeta && <span className={styles.errorText}>{errores.numeroTarjeta}</span>}
          </div>
          <div className={`${styles.field} ${errores.vencimiento ? styles.fieldError : ''}`}>
            <label>Vencimiento</label>
            <input {...campo('vencimiento')} placeholder="MM/AA" maxLength={5} />
            {errores.vencimiento && <span className={styles.errorText}>{errores.vencimiento}</span>}
          </div>
          <div className={`${styles.field} ${errores.cvv ? styles.fieldError : ''}`}>
            <label>CVV</label>
            <input {...campo('cvv')} placeholder="123" maxLength={4} />
            {errores.cvv && <span className={styles.errorText}>{errores.cvv}</span>}
          </div>
        </div>
      )}

      {datos.metodoPago === 'paypal' && (
        <p style={{ color: 'var(--color-text-dim)', fontSize: '0.9rem' }}>
          Al confirmar tu pedido te llevaremos a PayPal para que pagues de forma segura. Al terminar regresarás a FitStock.
        </p>
      )}
      {datos.metodoPago === 'mercadopago' && (
        <p style={{ color: 'var(--color-text-dim)', fontSize: '0.9rem' }}>
          Al confirmar tu pedido te llevaremos a Mercado Pago, donde puedes pagar con tarjeta, saldo en cuenta o efectivo. Al terminar regresarás a FitStock.
        </p>
      )}
      {datos.metodoPago === 'transferencia' && (
        <p style={{ color: 'var(--color-text-dim)', fontSize: '0.9rem' }}>
          Recibirás la CLABE interbancaria por correo para completar tu transferencia.
        </p>
      )}

      <div className={styles.actions}>
        <button type="button" className="btn btn-secondary" onClick={onRegresar}>← Regresar</button>
        <button type="button" className="btn btn-primary" onClick={onContinuar}>Revisar pedido →</button>
      </div>
    </div>
  );
}
