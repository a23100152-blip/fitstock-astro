// ShippingStep.jsx — Paso 1 del Checkout: contacto + dirección de envío.
// Tema: hooks (useState) + eventos (onChange/onSubmit) + validación controlada.
import styles from './Checkout.module.css';

const ESTADOS_MX = [
  'Jalisco', 'Ciudad de México', 'Nuevo León', 'Estado de México', 'Puebla',
  'Guanajuato', 'Querétaro', 'Baja California', 'Veracruz', 'Yucatán', 'Otro',
];

export function validarEnvio(datos) {
  const errores = {};
  if (!datos.nombreContacto?.trim()) errores.nombreContacto = 'Ingresa tu nombre completo.';
  if (!datos.emailContacto?.trim()) {
    errores.emailContacto = 'Ingresa tu correo electrónico.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.emailContacto)) {
    errores.emailContacto = 'El correo no tiene un formato válido.';
  }
  if (!datos.calle?.trim()) errores.calle = 'La calle es obligatoria.';
  if (!datos.ciudad?.trim()) errores.ciudad = 'La ciudad es obligatoria.';
  if (!datos.estado?.trim()) errores.estado = 'Selecciona un estado.';
  if (!/^\d{5}$/.test(datos.cp || '')) errores.cp = 'El código postal debe tener 5 dígitos.';
  if (!/^\d{10}$/.test((datos.telefono || '').replace(/\s/g, ''))) {
    errores.telefono = 'El teléfono debe tener 10 dígitos.';
  }
  return errores;
}

export default function ShippingStep({ datos, errores, onChange, onContinuar }) {
  const campo = (name) => ({
    value: datos[name] || '',
    onChange: (e) => onChange(name, e.target.value),
  });

  return (
    <div className={styles.panel}>
      <h3 style={{ marginTop: 0 }}>1. Datos de envío</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onContinuar();
        }}
      >
        <div className={styles.formGrid}>
          <div className={`${styles.field} ${errores.nombreContacto ? styles.fieldError : ''} ${styles.fieldFull}`}>
            <label htmlFor="nombreContacto">Nombre completo</label>
            <input id="nombreContacto" {...campo('nombreContacto')} placeholder="Matías Ramón Gómez González" />
            {errores.nombreContacto && <span className={styles.errorText}>{errores.nombreContacto}</span>}
          </div>

          <div className={`${styles.field} ${errores.emailContacto ? styles.fieldError : ''} ${styles.fieldFull}`}>
            <label htmlFor="emailContacto">Correo electrónico</label>
            <input id="emailContacto" type="email" {...campo('emailContacto')} placeholder="tu@correo.com" />
            {errores.emailContacto && <span className={styles.errorText}>{errores.emailContacto}</span>}
          </div>

          <div className={`${styles.field} ${errores.calle ? styles.fieldError : ''}`}>
            <label htmlFor="calle">Calle</label>
            <input id="calle" {...campo('calle')} placeholder="Av. Patria" />
            {errores.calle && <span className={styles.errorText}>{errores.calle}</span>}
          </div>

          <div className={styles.field}>
            <label htmlFor="numero">Número (opcional)</label>
            <input id="numero" {...campo('numero')} placeholder="1234" />
          </div>

          <div className={`${styles.field} ${errores.ciudad ? styles.fieldError : ''}`}>
            <label htmlFor="ciudad">Ciudad</label>
            <input id="ciudad" {...campo('ciudad')} placeholder="Zapopan" />
            {errores.ciudad && <span className={styles.errorText}>{errores.ciudad}</span>}
          </div>

          <div className={`${styles.field} ${errores.estado ? styles.fieldError : ''}`}>
            <label htmlFor="estado">Estado</label>
            <select id="estado" {...campo('estado')}>
              <option value="">Selecciona…</option>
              {ESTADOS_MX.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
            {errores.estado && <span className={styles.errorText}>{errores.estado}</span>}
          </div>

          <div className={`${styles.field} ${errores.cp ? styles.fieldError : ''}`}>
            <label htmlFor="cp">Código postal</label>
            <input id="cp" {...campo('cp')} placeholder="45010" maxLength={5} />
            {errores.cp && <span className={styles.errorText}>{errores.cp}</span>}
          </div>

          <div className={`${styles.field} ${errores.telefono ? styles.fieldError : ''}`}>
            <label htmlFor="telefono">Teléfono (10 dígitos)</label>
            <input id="telefono" {...campo('telefono')} placeholder="3312345678" maxLength={10} />
            {errores.telefono && <span className={styles.errorText}>{errores.telefono}</span>}
          </div>
        </div>

        <div className={styles.actions}>
          <span />
          <button type="submit" className="btn btn-primary">Continuar a pago →</button>
        </div>
      </form>
    </div>
  );
}
