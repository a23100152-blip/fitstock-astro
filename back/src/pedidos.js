// pedidos.js — Operaciones de ciclo de vida del pedido ligadas al cobro:
// cancelar (devolviendo el stock) y liberar pedidos que nunca se pagaron.
import { db } from './db.js';
import { METODOS_CON_PASARELA } from './pagos.js';

// "YYYY-MM-DD HH:MM:SS" en UTC: el mismo formato que datetime('now') de SQLite.
export const ahoraSQL = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

// Cancela el pedido y regresa al inventario lo que se había reservado, en una sola transacción.
// `estadoPagoFinal`: 'cancelado' cuando el cobro nunca se completó; null para no tocar el estado del pago.
export async function cancelarPedidoYRestaurarStock(pedidoId, estadoPagoFinal = 'cancelado') {
  return db.transaccion(async (tx) => {
    const pedido = await tx.get('SELECT id, estado FROM pedido WHERE id = ?', Number(pedidoId));
    if (!pedido || pedido.estado === 'cancelado') return false;

    const detalles = await tx.all('SELECT producto_id, cantidad FROM pedido_detalle WHERE pedido_id = ?', Number(pedidoId));
    for (const d of detalles) {
      await tx.run('UPDATE producto SET stock = stock + ? WHERE id = ?', d.cantidad, d.producto_id);
    }
    if (estadoPagoFinal) {
      await tx.run("UPDATE pedido SET estado = 'cancelado', estado_pago = ? WHERE id = ?", estadoPagoFinal, Number(pedidoId));
    } else {
      await tx.run("UPDATE pedido SET estado = 'cancelado' WHERE id = ?", Number(pedidoId));
    }
    return true;
  });
}

// Un pedido de PayPal / Mercado Pago que nadie pagó mantiene el stock reservado.
// Pasados N minutos se cancela y el inventario vuelve a estar disponible.
const MINUTOS_LIMITE = Number(process.env.PAGO_TIMEOUT_MIN || 30);

export async function liberarPedidosAbandonados() {
  const marcas = METODOS_CON_PASARELA.map(() => '?').join(', ');
  const filas = await db.all(
    `SELECT id FROM pedido
      WHERE estado_pago = 'pendiente' AND estado <> 'cancelado'
        AND metodo_pago IN (${marcas})
        AND NOT (metodo_pago = 'mercadopago' AND referencia_pago IS NOT NULL) -- pago en revisión: no se cancela solo
        AND fecha_creacion < datetime('now', ?)`,
    ...METODOS_CON_PASARELA,
    `-${MINUTOS_LIMITE} minutes`
  );
  let liberados = 0;
  for (const { id } of filas) {
    if (await cancelarPedidoYRestaurarStock(id, 'cancelado')) liberados++;
  }
  if (liberados > 0) console.log(`🧹 ${liberados} pedido(s) sin pagar cancelado(s); stock devuelto.`);
  return liberados;
}
