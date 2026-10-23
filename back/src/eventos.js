// eventos.js — Tiempo real del BackOffice (GraphQL Subscriptions).
//
// `pubSub` es el canal de publicación/suscripción de graphql-yoga. Cuando algo
// cambia en el sistema (un pedido nuevo, un ajuste de stock, un usuario
// desactivado…) se PUBLICA un evento; los administradores que tengan el
// BackOffice abierto están SUSCRITOS y lo reciben al instante por SSE
// (Server-Sent Events), sin recargar la página.
//
// Canales:
//   EVENTO_BACKOFFICE → bitácora de auditoría (quién hizo qué)
//   PEDIDO            → un pedido se creó o cambió de estado
//   STOCK             → cambió el inventario de un producto
import { createPubSub } from 'graphql-yoga';
import { db } from './db.js';

export const pubSub = createPubSub();

export const CANAL = {
  EVENTO: 'EVENTO_BACKOFFICE',
  PEDIDO: 'PEDIDO',
  STOCK: 'STOCK',
};

// Guarda el evento en la bitácora y lo publica a los suscriptores.
// No debe tumbar la operación principal si algo falla: solo se registra en consola.
export async function registrarEvento({ accion, entidad, entidadId = null, mensaje, usuario = null }) {
  try {
    const info = await db.run(
      'INSERT INTO bitacora (accion, entidad, entidad_id, mensaje, usuario_id, usuario) VALUES (?, ?, ?, ?, ?, ?)',
      accion,
      entidad,
      entidadId == null ? null : Number(entidadId),
      mensaje,
      usuario?.id ?? null,
      usuario?.nombre ?? 'Sistema'
    );
    const fila = await db.get('SELECT * FROM bitacora WHERE id = ?', info.lastInsertRowid);
    pubSub.publish(CANAL.EVENTO, fila);
  } catch (err) {
    console.error('registrarEvento:', err.message);
  }
}

// Publica el estado más reciente de un pedido.
export async function notificarPedido(pedidoId) {
  try {
    const fila = await db.get('SELECT * FROM pedido WHERE id = ?', Number(pedidoId));
    if (fila) pubSub.publish(CANAL.PEDIDO, fila);
  } catch (err) {
    console.error('notificarPedido:', err.message);
  }
}

// Publica el stock más reciente de uno o varios productos.
export async function notificarStock(...productoIds) {
  for (const id of new Set(productoIds.map(Number))) {
    try {
      const fila = await db.get('SELECT * FROM producto WHERE id = ?', id);
      if (fila) pubSub.publish(CANAL.STOCK, fila);
    } catch (err) {
      console.error('notificarStock:', err.message);
    }
  }
}
