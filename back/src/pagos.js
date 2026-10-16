// pagos.js — Integración con las pasarelas de pago (PayPal y Mercado Pago).
//
// Flujo (el mismo para las dos pasarelas):
//   1. crearPedido        → pedido en estado_pago = 'pendiente' (stock reservado).
//   2. iniciarPago        → este módulo crea la orden/preferencia en la pasarela
//                           y devuelve la URL a la que se redirige al cliente.
//   3. El cliente paga en la pasarela y regresa a /pago/retorno del frontend.
//   4. confirmarPago      → este módulo CONSULTA a la pasarela (no confía en lo
//                           que diga la URL) y solo entonces marca el pedido como pagado.
//
// Modo real vs. simulado:
//   - Si hay credenciales en el entorno (PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET,
//     MP_ACCESS_TOKEN) se habla con la pasarela real (sandbox o producción).
//   - Si NO hay credenciales, ese método corre en modo "simulado": el flujo es
//     el mismo pero la pantalla de pago es una página local (/pago/simulado).
//     Sirve para demostrar y probar sin cuentas de desarrollador.

const FRONT_URL = (process.env.FRONT_URL || 'http://localhost:4321').replace(/\/$/, '');
const MONEDA = process.env.PAGOS_MONEDA || 'MXN';

// ---------------- Configuración ----------------
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || '';
const PAYPAL_BASE =
  (process.env.PAYPAL_ENV || 'sandbox') === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || '';
const MP_BASE = 'https://api.mercadopago.com';

export const METODOS_CON_PASARELA = ['paypal', 'mercadopago'];
// PayPal redirige al cliente a su sitio. Mercado Pago NO: se paga con nuestro propio formulario (Checkout API).
export const METODOS_CON_REDIRECCION = ['paypal'];

export function modoDePasarela(metodo) {
  if (metodo === 'paypal') return PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET ? 'real' : 'simulado';
  if (metodo === 'mercadopago') return MP_ACCESS_TOKEN ? 'real' : 'simulado';
  return null;
}

const dinero = (n) => Number(Number(n).toFixed(2));
const urlRetorno = (pedidoId, metodo, extra = {}) => {
  const q = new URLSearchParams({ metodo, pedido: String(pedidoId), ...extra });
  return `${FRONT_URL}/pago/retorno?${q}`;
};

async function pedirJson(url, opciones, nombre) {
  let res;
  try {
    res = await fetch(url, opciones);
  } catch (err) {
    throw new Error(`No se pudo conectar con ${nombre}. Revisa tu conexión a internet.`);
  }
  const texto = await res.text();
  let json = {};
  try {
    json = texto ? JSON.parse(texto) : {};
  } catch {
    /* respuesta no JSON */
  }
  if (!res.ok) {
    const detalle = json.message || json.error_description || json.details?.[0]?.description || texto.slice(0, 200);
    const error = new Error(`${nombre} rechazó la operación (${res.status}): ${detalle}`);
    error.status = res.status; // para saber si fue un rechazo del pago (422) o un error de configuración
    error.issue = json.details?.[0]?.issue || json.name || null;
    throw error;
  }
  return json;
}

// =====================================================================
//  PayPal (Orders API v2)
// =====================================================================
async function tokenPaypal() {
  const basic = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const json = await pedirJson(
    `${PAYPAL_BASE}/v1/oauth2/token`,
    {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    },
    'PayPal'
  );
  return json.access_token;
}

export async function crearPagoPaypal(pedido) {
  if (modoDePasarela('paypal') === 'simulado') {
    return { modo: 'simulado', referencia: `SIM-PP-${pedido.id}`, urlPago: `${FRONT_URL}/pago/simulado?metodo=paypal&pedido=${pedido.id}` };
  }

  const accessToken = await tokenPaypal();
  const orden = await pedirJson(
    `${PAYPAL_BASE}/v2/checkout/orders`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `fitstock-pedido-${pedido.id}`, // idempotencia: reintentar no duplica la orden
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: `pedido-${pedido.id}`,
            custom_id: String(pedido.id),
            description: `Pedido #${pedido.id} — FitStock`,
            amount: { currency_code: MONEDA, value: dinero(pedido.total).toFixed(2) },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: 'FitStock',
              locale: 'es-MX',
              user_action: 'PAY_NOW',
              shipping_preference: 'NO_SHIPPING', // la dirección ya se pidió en nuestro checkout
              return_url: urlRetorno(pedido.id, 'paypal'),
              cancel_url: urlRetorno(pedido.id, 'paypal', { resultado: 'cancelado' }),
            },
          },
        },
      }),
    },
    'PayPal'
  );

  const enlace = orden.links?.find((l) => l.rel === 'payer-action') || orden.links?.find((l) => l.rel === 'approve');
  if (!enlace) throw new Error('PayPal no devolvió la URL de aprobación.');
  return { modo: 'real', referencia: orden.id, urlPago: enlace.href };
}

// Captura la orden aprobada por el cliente y verifica que sea la de este pedido.
// Devuelve { pagado, rechazado, referencia, estadoPasarela }:
//   pagado    = PayPal cobró el monto correcto → el pedido queda pagado.
//   rechazado = el pago NO se hizo (no aprobó, tarjeta declinada, captura fallida) → el pedido se cancela.
//   ninguno   = captura en revisión (PENDING) → el pedido sigue pendiente.
export async function verificarPagoPaypal(pedido, ordenId) {
  if (modoDePasarela('paypal') === 'simulado') {
    return { pagado: true, rechazado: false, referencia: `SIM-PP-${pedido.id}` };
  }
  if (!ordenId) throw new Error('Falta el identificador de la orden de PayPal.');

  const accessToken = await tokenPaypal();
  const cabeceras = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation', // respuesta completa (custom_id, montos); sin esto la captura llega recortada
  };

  let orden = await pedirJson(`${PAYPAL_BASE}/v2/checkout/orders/${encodeURIComponent(ordenId)}`, { headers: cabeceras }, 'PayPal');

  if (orden.status === 'APPROVED') {
    try {
      orden = await pedirJson(
        `${PAYPAL_BASE}/v2/checkout/orders/${encodeURIComponent(ordenId)}/capture`,
        { method: 'POST', headers: { ...cabeceras, 'PayPal-Request-Id': `fitstock-captura-${pedido.id}` }, body: '{}' },
        'PayPal'
      );
    } catch (err) {
      // 422 = PayPal no pudo cobrar (p. ej. INSTRUMENT_DECLINED: tarjeta/cuenta rechazada).
      if (err.status === 422) {
        return { pagado: false, rechazado: true, referencia: ordenId, estadoPasarela: err.issue || 'DECLINED' };
      }
      throw err;
    }
  }

  const unidad = orden.purchase_units?.[0];
  const captura = unidad?.payments?.captures?.[0];
  const customId = unidad?.custom_id ?? captura?.custom_id;
  if (customId !== String(pedido.id)) {
    throw new Error('La orden de PayPal no corresponde a este pedido.');
  }

  // El cliente regresó sin aprobar el pago, o la orden quedó anulada.
  if (['CREATED', 'SAVED', 'PAYER_ACTION_REQUIRED', 'VOIDED'].includes(orden.status)) {
    return { pagado: false, rechazado: true, referencia: ordenId, estadoPasarela: orden.status };
  }
  // La captura se intentó pero PayPal la rechazó.
  if (['DECLINED', 'FAILED'].includes(captura?.status)) {
    return { pagado: false, rechazado: true, referencia: captura.id, estadoPasarela: captura.status };
  }
  if (orden.status !== 'COMPLETED' || captura?.status !== 'COMPLETED') {
    // PENDING: PayPal está revisando el cobro. Se queda pendiente.
    return { pagado: false, rechazado: false, referencia: captura?.id || ordenId, estadoPasarela: captura?.status || orden.status };
  }
  if (captura.amount?.currency_code !== MONEDA || dinero(captura.amount.value) !== dinero(pedido.total)) {
    throw new Error('El monto cobrado por PayPal no coincide con el total del pedido.');
  }
  return { pagado: true, rechazado: false, referencia: captura.id };
}

// =====================================================================
//  Mercado Pago (Checkout API — formulario PROPIO, sin redirección)
// =====================================================================
// Ya NO usamos Checkout Pro (la pantalla de pago prediseñada por Mercado Pago).
// El formulario de tarjeta lo diseñamos nosotros en el frontend (PaymentStep.jsx).
// Los datos sensibles (número, vencimiento, CVV) los capturan los "Secure Fields"
// de MercadoPago.js dentro de iframes y devuelven un TOKEN de un solo uso: ese token
// es lo único que llega a este servidor. Aquí hacemos POST /v1/payments con el token
// y el monto SALE DE NUESTRA BASE DE DATOS (nunca del navegador).
const cabecerasMP = () => ({ Authorization: `Bearer ${MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' });

const MENSAJES_RECHAZO = {
  cc_rejected_insufficient_amount: 'La tarjeta no tiene fondos suficientes.',
  cc_rejected_bad_filled_card_number: 'Revisa el número de tarjeta.',
  cc_rejected_bad_filled_date: 'Revisa la fecha de vencimiento.',
  cc_rejected_bad_filled_security_code: 'Revisa el código de seguridad (CVV).',
  cc_rejected_bad_filled_other: 'Revisa los datos de la tarjeta.',
  cc_rejected_call_for_authorize: 'Tu banco requiere que autorices el pago. Llámale y vuelve a intentar.',
  cc_rejected_card_disabled: 'La tarjeta está inactiva. Actívala con tu banco o usa otra.',
  cc_rejected_duplicated_payment: 'Ya hiciste un pago igual hace un momento.',
  cc_rejected_high_risk: 'No pudimos procesar el pago por seguridad. Prueba con otra tarjeta.',
  cc_rejected_max_attempts: 'Llegaste al límite de intentos. Usa otra tarjeta o espera un rato.',
  cc_rejected_invalid_installments: 'La tarjeta no acepta ese número de pagos.',
  cc_rejected_blacklist: 'No pudimos procesar el pago con esta tarjeta.',
  cc_rejected_other_reason: 'Tu banco rechazó el pago. Prueba con otra tarjeta.',
};
const mensajeDeEstado = (estado, detalle) => {
  if (estado === 'approved') return 'Pago aprobado.';
  if (estado === 'in_process' || estado === 'pending') {
    return 'Mercado Pago dejó el pago en revisión, así que no se completó el pedido. No se hizo ningún cargo; prueba con otra tarjeta.';
  }
  return MENSAJES_RECHAZO[detalle] || 'El pago fue rechazado. Prueba con otra tarjeta.';
};

// MODO SIMULADO: imita las reglas de prueba de Mercado Pago. En el sandbox real el
// resultado lo decide el NOMBRE DEL TITULAR que se escribe en la tarjeta de prueba:
//   APRO = aprobado · CONT = pendiente · OTHE, CALL, FUND, SECU, EXPI, FORM… = rechazado.
// Así el modo demostración se comporta igual que las tarjetas de prueba oficiales.
const RESULTADOS_PRUEBA = {
  APRO: ['approved', 'accredited'],
  CONT: ['in_process', 'pending_contingency'],
  OTHE: ['rejected', 'cc_rejected_other_reason'],
  CALL: ['rejected', 'cc_rejected_call_for_authorize'],
  FUND: ['rejected', 'cc_rejected_insufficient_amount'],
  SECU: ['rejected', 'cc_rejected_bad_filled_security_code'],
  EXPI: ['rejected', 'cc_rejected_bad_filled_date'],
  FORM: ['rejected', 'cc_rejected_bad_filled_other'],
  CARD: ['rejected', 'cc_rejected_bad_filled_card_number'],
  INST: ['rejected', 'cc_rejected_invalid_installments'],
  DUPL: ['rejected', 'cc_rejected_duplicated_payment'],
  LOCK: ['rejected', 'cc_rejected_card_disabled'],
  CTNA: ['rejected', 'cc_rejected_other_reason'],
  ATTE: ['rejected', 'cc_rejected_max_attempts'],
  BLAC: ['rejected', 'cc_rejected_blacklist'],
  UNSU: ['rejected', 'cc_rejected_other_reason'],
};

// Token simulado que arma el frontend: "SIM-<últimos 4>-<nombre del titular>".
function resultadoSimulado(token) {
  const [, ultimos = '', ...resto] = String(token).split('-');
  const titular = decodeURIComponent(resto.join('-')).trim().toUpperCase();
  const codigo = titular.split(/\s+/)[0]; // "OTHE", "OTHE OTHE", "APRO PEREZ"…
  if (RESULTADOS_PRUEBA[codigo]) return RESULTADOS_PRUEBA[codigo];
  if (ultimos === '0000') return ['rejected', 'cc_rejected_other_reason']; // regla extra del modo demo
  return ['approved', 'accredited'];
}

// Cancela en Mercado Pago un pago que quedó pendiente/en revisión, para que nunca se cobre
// después sin pedido (no tenemos webhook que nos avise si se aprueba más tarde).
async function cancelarPagoMercadoPago(pagoId) {
  try {
    await pedirJson(
      `${MP_BASE}/v1/payments/${encodeURIComponent(pagoId)}`,
      { method: 'PUT', headers: cabecerasMP(), body: JSON.stringify({ status: 'cancelled' }) },
      'Mercado Pago'
    );
  } catch (err) {
    console.error(`No se pudo cancelar el pago ${pagoId} en Mercado Pago:`, err.message);
  }
}

// Cobra el pedido con el token de tarjeta que generó el navegador.
// Devuelve { estadoPasarela, aprobado, referencia, mensaje }.
// SOLO "approved" cuenta como pagado: rechazado o pendiente = el pedido NO se completa.
export async function cobrarConTarjetaMercadoPago(pedido, { token, metodoPagoId, cuotas, emisorId }) {
  if (!token) throw new Error('Falta el token de la tarjeta.');
  const tokenSimulado = String(token).startsWith('SIM-');

  // ---- Modo simulado (sin MP_ACCESS_TOKEN en back/.env) ----
  if (modoDePasarela('mercadopago') === 'simulado') {
    if (!tokenSimulado) {
      // El front tiene PUBLIC_MP_PUBLIC_KEY pero el back no tiene MP_ACCESS_TOKEN: antes esto aprobaba TODO.
      throw new Error('Mercado Pago está configurado a medias: falta MP_ACCESS_TOKEN en back/.env (o quita PUBLIC_MP_PUBLIC_KEY de front/.env).');
    }
    const [estadoPasarela, detalle] = resultadoSimulado(token);
    return {
      estadoPasarela,
      aprobado: estadoPasarela === 'approved',
      referencia: `SIM-MP-${pedido.id}-${Date.now()}`,
      mensaje: mensajeDeEstado(estadoPasarela, detalle),
    };
  }

  // ---- Modo real ----
  if (tokenSimulado) {
    throw new Error('Mercado Pago está configurado a medias: falta PUBLIC_MP_PUBLIC_KEY en front/.env (o quita MP_ACCESS_TOKEN de back/.env).');
  }

  const cuerpo = {
    transaction_amount: dinero(pedido.total),
    token,
    description: `Pedido #${pedido.id} — FitStock`,
    installments: Number(cuotas) > 0 ? Number(cuotas) : 1,
    payment_method_id: metodoPagoId,
    payer: { email: pedido.emailContacto },
    external_reference: String(pedido.id),
    statement_descriptor: 'FITSTOCK',
  };
  if (emisorId) cuerpo.issuer_id = Number(emisorId);

  const pago = await pedirJson(
    `${MP_BASE}/v1/payments`,
    {
      method: 'POST',
      // Un token solo sirve una vez, así que la llave de idempotencia lo incluye:
      // reintentar la MISMA petición no cobra doble; otra tarjeta sí es un intento nuevo.
      headers: { ...cabecerasMP(), 'X-Idempotency-Key': `fitstock-pago-${pedido.id}-${token}` },
      body: JSON.stringify(cuerpo),
    },
    'Mercado Pago'
  );

  if (String(pago.external_reference) !== String(pedido.id)) {
    throw new Error('El pago de Mercado Pago no corresponde a este pedido.');
  }
  const aprobado = pago.status === 'approved';
  if (aprobado && dinero(pago.transaction_amount) !== dinero(pedido.total)) {
    throw new Error('El monto cobrado por Mercado Pago no coincide con el total del pedido.');
  }
  // Pendiente / en revisión: se cancela en Mercado Pago para que no se cobre después sin pedido.
  if (pago.status === 'in_process' || pago.status === 'pending') {
    await cancelarPagoMercadoPago(pago.id);
  }
  return {
    estadoPasarela: pago.status,
    aprobado,
    referencia: String(pago.id),
    mensaje: mensajeDeEstado(pago.status, pago.status_detail),
  };
}
