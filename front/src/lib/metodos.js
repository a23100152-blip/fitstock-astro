// metodos.js — Etiquetas y colores compartidos de métodos de pago y estados.
// (Lo usan "Mis pedidos", la pantalla de retorno del pago y el dashboard de admin.)
export const METODO_LABEL = {
  tarjeta: 'Tarjeta',
  paypal: 'PayPal',
  mercadopago: 'Mercado Pago',
  transferencia: 'Transferencia',
};

export const METODO_COLOR = {
  tarjeta: '#ff4425',
  paypal: '#4c8bf5',
  mercadopago: '#ffe600',
  transferencia: '#7bd88f',
};

export const ESTADO_PAGO_LABEL = {
  pendiente: 'Pago pendiente',
  pagado: 'Pagado',
  cancelado: 'Pago cancelado',
};

export const ESTADO_PEDIDO_LABEL = {
  procesando: 'Procesando',
  enviado: 'Enviado',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

export const ESTADO_PEDIDO_COLOR = {
  procesando: '#ffb020',
  enviado: '#4c8bf5',
  entregado: '#7bd88f',
  cancelado: '#8c8c8c',
};

export const mxn = (n) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(n ?? 0);

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
// '2026-09-09' → '9 sep'
export const fechaCorta = (iso) => {
  const [, m, d] = iso.split('-');
  return `${Number(d)} ${MESES[Number(m) - 1]}`;
};
