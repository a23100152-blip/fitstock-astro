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
    throw new Error(`${nombre} rechazó la operación (${res.status}): ${detalle}`);
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
export async function verificarPagoPaypal(pedido, ordenId) {
  if (modoDePasarela('paypal') === 'simulado') {
    return { pagado: true, referencia: `SIM-PP-${pedido.id}` };
  }
  if (!ordenId) throw new Error('Falta el identificador de la orden de PayPal.');

  const accessToken = await tokenPaypal();
  const cabeceras = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

  let orden = await pedirJson(`${PAYPAL_BASE}/v2/checkout/orders/${encodeURIComponent(ordenId)}`, { headers: cabeceras }, 'PayPal');

  if (orden.status === 'APPROVED') {
    orden = await pedirJson(
      `${PAYPAL_BASE}/v2/checkout/orders/${encodeURIComponent(ordenId)}/capture`,
      { method: 'POST', headers: { ...cabeceras, 'PayPal-Request-Id': `fitstock-captura-${pedido.id}` }, body: '{}' },
      'PayPal'
    );
  }

  const unidad = orden.purchase_units?.[0];
  const captura = unidad?.payments?.captures?.[0];
  if (unidad?.custom_id !== String(pedido.id)) {
    throw new Error('La orden de PayPal no corresponde a este pedido.');
  }
  if (orden.status !== 'COMPLETED' || captura?.status !== 'COMPLETED') {
    return { pagado: false, referencia: ordenId, estadoPasarela: captura?.status || orden.status };
  }
  if (captura.amount?.currency_code !== MONEDA || dinero(captura.amount.value) !== dinero(pedido.total)) {
    throw new Error('El monto cobrado por PayPal no coincide con el total del pedido.');
  }
  return { pagado: true, referencia: captura.id };
}

// =====================================================================
//  Mercado Pago (Checkout Pro)
// =====================================================================
const cabecerasMP = () => ({ Authorization: `Bearer ${MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' });

export async function crearPagoMercadoPago(pedido, lineas) {
  if (modoDePasarela('mercadopago') === 'simulado') {
    return { modo: 'simulado', referencia: `SIM-MP-${pedido.id}`, urlPago: `${FRONT_URL}/pago/simulado?metodo=mercadopago&pedido=${pedido.id}` };
  }

  const items = lineas.map((l) => ({
    id: String(l.productoId),
    title: l.nombre,
    quantity: l.cantidad,
    unit_price: dinero(l.precioUnitario),
    currency_id: MONEDA,
  }));
  if (pedido.envio > 0) {
    items.push({ id: 'envio', title: 'Envío', quantity: 1, unit_price: dinero(pedido.envio), currency_id: MONEDA });
  }

  const preferencia = {
    items,
    payer: { name: pedido.nombreContacto, email: pedido.emailContacto },
    external_reference: String(pedido.id), // así identificamos el pedido al verificar el pago
    statement_descriptor: 'FITSTOCK',
    back_urls: {
      success: urlRetorno(pedido.id, 'mercadopago', { resultado: 'exito' }),
      failure: urlRetorno(pedido.id, 'mercadopago', { resultado: 'fallido' }),
      pending: urlRetorno(pedido.id, 'mercadopago', { resultado: 'pendiente' }),
    },
  };
  // Mercado Pago solo acepta auto_return con URLs públicas https (no con localhost).
  if (FRONT_URL.startsWith('https://')) preferencia.auto_return = 'approved';

  const json = await pedirJson(
    `${MP_BASE}/checkout/preferences`,
    { method: 'POST', headers: { ...cabecerasMP(), 'X-Idempotency-Key': `fitstock-pref-${pedido.id}-${Date.now()}` }, body: JSON.stringify(preferencia) },
    'Mercado Pago'
  );
  return { modo: 'real', referencia: json.id, urlPago: json.init_point };
}

// Consulta el pago en la API de Mercado Pago (por payment_id, o buscando por external_reference).
export async function verificarPagoMercadoPago(pedido, pagoId) {
  if (modoDePasarela('mercadopago') === 'simulado') {
    return { pagado: true, referencia: `SIM-MP-${pedido.id}` };
  }

  let pago = null;
  if (pagoId && pagoId !== 'null') {
    pago = await pedirJson(`${MP_BASE}/v1/payments/${encodeURIComponent(pagoId)}`, { headers: cabecerasMP() }, 'Mercado Pago');
  } else {
    const busqueda = await pedirJson(
      `${MP_BASE}/v1/payments/search?external_reference=${pedido.id}&sort=date_created&criteria=desc`,
      { headers: cabecerasMP() },
      'Mercado Pago'
    );
    pago = busqueda.results?.[0] ?? null;
  }
  if (!pago) return { pagado: false, referencia: null, estadoPasarela: 'sin_pago' };

  if (String(pago.external_reference) !== String(pedido.id)) {
    throw new Error('El pago de Mercado Pago no corresponde a este pedido.');
  }
  if (pago.status !== 'approved') {
    return { pagado: false, referencia: String(pago.id), estadoPasarela: pago.status };
  }
  if (dinero(pago.transaction_amount) !== dinero(pedido.total)) {
    throw new Error('El monto cobrado por Mercado Pago no coincide con el total del pedido.');
  }
  return { pagado: true, referencia: String(pago.id) };
}
