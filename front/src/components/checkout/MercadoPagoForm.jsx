// MercadoPagoForm.jsx — Formulario de tarjeta DISEÑADO POR NOSOTROS para Mercado Pago.
//
// Es la integración "Checkout API" (Core Methods + Secure Fields) y NO Checkout Pro:
//  - La interfaz (títulos, campos, cuotas, colores, errores) es 100% la de FitStock.
//  - Solo número de tarjeta, vencimiento y CVV son iframes seguros de MercadoPago.js
//    (obligatorio por seguridad PCI: esos datos nunca tocan nuestro código ni servidor).
//  - Al continuar, `tokenizar()` pide a Mercado Pago un TOKEN de un solo uso. Ese token
//    es lo único que viaja a nuestro backend, que hace el cobro real (POST /v1/payments).
//
// Modo real: si existe PUBLIC_MP_PUBLIC_KEY en front/.env se cargan los Secure Fields.
// Modo simulado (sin llave): mismos campos pero normales, token falso "SIM-<últimos 4>".
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import styles from './Checkout.module.css';

const PUBLIC_KEY = import.meta.env.PUBLIC_MP_PUBLIC_KEY || '';
export const MP_MODO_REAL = Boolean(PUBLIC_KEY);

function cargarSdk() {
  if (window.MercadoPago) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existente = document.getElementById('mp-sdk');
    if (existente) {
      existente.addEventListener('load', resolve);
      existente.addEventListener('error', reject);
      return;
    }
    const s = document.createElement('script');
    s.id = 'mp-sdk';
    s.src = 'https://sdk.mercadopago.com/js/v2';
    s.onload = resolve;
    s.onerror = () => reject(new Error('No se pudo cargar Mercado Pago. Revisa tu conexión.'));
    document.head.appendChild(s);
  });
}

// Estilo del contenido de los iframes (se aplica dentro del campo seguro).
const ESTILO_CAMPO = { color: '#f4f4f4', fontSize: '15px', placeholderColor: '#8a8a8a' };

// ---- Ayudas de validación (solo modo demostración) ----
const soloDigitos = (t) => t.replace(/\D/g, '');
const formatearNumero = (t) => soloDigitos(t).slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
const formatearVenc = (t) => {
  const d = soloDigitos(t).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};
const soloLetras = (t) => t.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]/g, '');
const estaVencida = (venc) => {
  const [mm, aa] = venc.split('/').map(Number);
  const hoy = new Date();
  const anio = 2000 + aa;
  return anio < hoy.getFullYear() || (anio === hoy.getFullYear() && mm < hoy.getMonth() + 1);
};

const MarcaTarjeta = ({ id }) => (id ? <span className={styles.mpBrand}>{id.toUpperCase()}</span> : null);

const MercadoPagoForm = forwardRef(function MercadoPagoForm({ total, errores = {} }, ref) {
  const mpRef = useRef(null);
  const camposRef = useRef({});
  const emisorRef = useRef(null);

  const [cargando, setCargando] = useState(MP_MODO_REAL);
  const [errorSdk, setErrorSdk] = useState('');
  const [titular, setTitular] = useState('');
  const [marca, setMarca] = useState('');
  const [cuotas, setCuotas] = useState([{ valor: 1, texto: '1 pago de contado' }]);
  const [cuotasSel, setCuotasSel] = useState(1);
  // Solo modo simulado: campos normales
  const [sim, setSim] = useState({ numero: '', venc: '', cvv: '' });
  const [erroresLocales, setErroresLocales] = useState({});

  // ---- Modo real: montar los Secure Fields dentro de NUESTROS contenedores ----
  useEffect(() => {
    if (!MP_MODO_REAL) return;
    let vivo = true;
    let binActual = null;

    (async () => {
      try {
        await cargarSdk();
        if (!vivo) return;
        const mp = new window.MercadoPago(PUBLIC_KEY, { locale: 'es-MX' });
        mpRef.current = mp;

        const numero = mp.fields.create('cardNumber', { placeholder: '4075 5957 1648 3764', style: ESTILO_CAMPO });
        const venc = mp.fields.create('expirationDate', { placeholder: 'MM/AA', style: ESTILO_CAMPO });
        const cvv = mp.fields.create('securityCode', { placeholder: '123', style: ESTILO_CAMPO });
        numero.mount('mp-numero');
        venc.mount('mp-venc');
        cvv.mount('mp-cvv');
        camposRef.current = { numero, venc, cvv };

        // Cuando el cliente escribe los primeros 8 dígitos (BIN) averiguamos marca y cuotas.
        numero.on('binChange', async ({ bin }) => {
          if (!bin) {
            binActual = null;
            setMarca('');
            setCuotas([{ valor: 1, texto: '1 pago de contado' }]);
            setCuotasSel(1);
            emisorRef.current = null;
            return;
          }
          if (bin === binActual) return;
          binActual = bin;
          try {
            const { results } = await mp.getPaymentMethods({ bin });
            const metodo = results?.[0];
            if (!metodo || !vivo) return;
            setMarca(metodo.id);
            camposRef.current.metodoPagoId = metodo.id;

            if (metodo.payment_type_id === 'credit_card') {
              const inst = await mp.getInstallments({ amount: String(total), bin, paymentTypeId: 'credit_card' });
              const costos = inst?.[0]?.payer_costs ?? [];
              emisorRef.current = inst?.[0]?.issuer?.id ?? null;
              if (costos.length && vivo) {
                setCuotas(costos.map((c) => ({ valor: c.installments, texto: c.recommended_message })));
                setCuotasSel(1);
              }
            } else {
              emisorRef.current = null;
              setCuotas([{ valor: 1, texto: '1 pago de contado' }]);
              setCuotasSel(1);
            }
          } catch {
            /* si falla la consulta, se paga en 1 exhibición */
          }
        });
        setCargando(false);
      } catch (e) {
        if (vivo) {
          setErrorSdk(e.message || 'No se pudo iniciar Mercado Pago.');
          setCargando(false);
        }
      }
    })();

    return () => {
      vivo = false;
      const { numero, venc, cvv } = camposRef.current;
      [numero, venc, cvv].forEach((c) => c?.unmount?.());
      camposRef.current = {};
    };
  }, [total]);

  // ---- El Checkout llama a esto al pulsar "Revisar pedido" ----
  useImperativeHandle(ref, () => ({
    async tokenizar() {
      const errs = {};
      if (titular.trim().length < 3) errs.titular = 'Ingresa el nombre tal como aparece en la tarjeta.';

      // Modo simulado
      if (!MP_MODO_REAL) {
        const digitos = sim.numero.replace(/\s/g, '');
        if (!/^\d{16}$/.test(digitos)) errs.numero = 'La tarjeta debe tener 16 dígitos.';
        if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(sim.venc)) errs.venc = 'Formato MM/AA.';
        else if (estaVencida(sim.venc)) errs.venc = 'La tarjeta está vencida.';
        if (!/^\d{3,4}$/.test(sim.cvv)) errs.cvv = 'CVV inválido.';
        setErroresLocales(errs);
        if (Object.keys(errs).length) return null;
        return {
          // El nombre del titular viaja en el token simulado para imitar las reglas de prueba de
          // Mercado Pago (APRO = aprobado, OTHE/FUND/SECU… = rechazado, CONT = pendiente).
          token: `SIM-${digitos.slice(-4)}-${encodeURIComponent(titular.trim().toUpperCase())}`,
          metodoPagoId: digitos.startsWith('4') ? 'visa' : digitos.startsWith('34') || digitos.startsWith('37') ? 'amex' : 'master',
          cuotas: Number(cuotasSel),
          emisorId: null,
          ultimos4: digitos.slice(-4),
        };
      }

      // Modo real
      if (!errs.titular && !camposRef.current.metodoPagoId) errs.numero = 'Ingresa un número de tarjeta válido.';
      if (Object.keys(errs).length) {
        setErroresLocales(errs);
        return null;
      }
      try {
        const resp = await mpRef.current.fields.createCardToken({ cardholderName: titular.trim() });
        setErroresLocales({});
        return {
          token: resp.id,
          metodoPagoId: camposRef.current.metodoPagoId,
          cuotas: Number(cuotasSel),
          emisorId: emisorRef.current ? String(emisorRef.current) : null,
          ultimos4: resp.last_four_digits,
        };
      } catch (e) {
        // MercadoPago.js devuelve una lista con el detalle de cada campo inválido.
        const lista = Array.isArray(e) ? e : [e];
        const nuevos = {};
        for (const err of lista) {
          const msg = err?.message || 'Dato inválido.';
          const campo = String(err?.field || err?.cause || msg).toLowerCase();
          if (campo.includes('number')) nuevos.numero = 'Revisa el número de tarjeta.';
          else if (campo.includes('expiration') || campo.includes('date')) nuevos.venc = 'Revisa la fecha de vencimiento.';
          else if (campo.includes('security') || campo.includes('cvv')) nuevos.cvv = 'Revisa el código de seguridad.';
          else if (campo.includes('holder') || campo.includes('name')) nuevos.titular = 'Revisa el nombre del titular.';
          else nuevos.general = msg;
        }
        setErroresLocales(nuevos);
        return null;
      }
    },
  }));

  const err = { ...errores, ...erroresLocales };
  const clase = (k) => `${styles.field} ${err[k] ? styles.fieldError : ''}`;

  return (
    <div className={styles.mpBox}>
      <div className={styles.mpHeader}>
        <span className={styles.mpLogo}>🤝 Mercado Pago</span>
        <span className={styles.mpLock}>🔒 Pago seguro</span>
      </div>

      {!MP_MODO_REAL && (
        <p className={styles.mpDemo}>
          Modo demostración: sin llave de Mercado Pago no se cobra nada real. Funciona como las tarjetas de
          prueba de Mercado Pago: el resultado lo decide el nombre del titular (APRO = aprobado; OTHE, FUND,
          SECU, EXPI, CALL, FORM = rechazado; CONT = pendiente).
        </p>
      )}
      {errorSdk && <p className={styles.errorText}>{errorSdk}</p>}
      {err.general && <p className={styles.errorText}>{err.general}</p>}
      {cargando && <p style={{ color: 'var(--color-text-dim)', fontSize: '0.9rem' }}>Cargando formulario seguro…</p>}

      <div className={styles.formGrid} style={cargando ? { opacity: 0.4, pointerEvents: 'none' } : undefined}>
        <div className={`${clase('titular')} ${styles.fieldFull}`}>
          <label>Nombre del titular</label>
          <input value={titular} onChange={(e) => setTitular(soloLetras(e.target.value))} placeholder="MATIAS GOMEZ" autoComplete="cc-name" />
          {err.titular && <span className={styles.errorText}>{err.titular}</span>}
        </div>

        <div className={`${clase('numero')} ${styles.fieldFull}`}>
          <label>Número de tarjeta <MarcaTarjeta id={marca} /></label>
          {MP_MODO_REAL ? (
            <div id="mp-numero" className={styles.mpIframe} />
          ) : (
            <input
              value={sim.numero}
              onChange={(e) => setSim({ ...sim, numero: formatearNumero(e.target.value) })}
              placeholder="4075 5957 1648 3764"
              maxLength={19}
              inputMode="numeric"
              autoComplete="cc-number"
            />
          )}
          {err.numero && <span className={styles.errorText}>{err.numero}</span>}
        </div>

        <div className={clase('venc')}>
          <label>Vencimiento</label>
          {MP_MODO_REAL ? (
            <div id="mp-venc" className={styles.mpIframe} />
          ) : (
            <input value={sim.venc} onChange={(e) => setSim({ ...sim, venc: formatearVenc(e.target.value) })} placeholder="MM/AA" maxLength={5} autoComplete="cc-exp" />
          )}
          {err.venc && <span className={styles.errorText}>{err.venc}</span>}
        </div>

        <div className={clase('cvv')}>
          <label>Código de seguridad</label>
          {MP_MODO_REAL ? (
            <div id="mp-cvv" className={styles.mpIframe} />
          ) : (
            <input
              value={sim.cvv}
              onChange={(e) => setSim({ ...sim, cvv: soloDigitos(e.target.value).slice(0, 4) })}
              placeholder="123"
              maxLength={4}
              inputMode="numeric"
              autoComplete="cc-csc"
            />
          )}
          {err.cvv && <span className={styles.errorText}>{err.cvv}</span>}
        </div>

        <div className={`${styles.field} ${styles.fieldFull}`}>
          <label>Pagos</label>
          <select value={cuotasSel} onChange={(e) => setCuotasSel(e.target.value)}>
            {cuotas.map((c) => (
              <option key={c.valor} value={c.valor}>{c.texto}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
});

export default MercadoPagoForm;
