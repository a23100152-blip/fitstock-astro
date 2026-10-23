// inventario.js — Kardex del BackOffice: cada cambio de stock deja un movimiento.
//
// Tipos de movimiento:
//   inicial    → stock con el que se dio de alta el producto
//   entrada    → llegó mercancía (compra a proveedor)
//   salida     → merma, daño o uso interno
//   ajuste     → corrección manual del conteo físico
//   venta      → salió por un pedido
//   devolucion → regresó por un pedido cancelado
//
// Se usa DENTRO de las transacciones (`ejecutor` puede ser `db` o el `tx` de una transacción),
// así el stock y su movimiento se guardan juntos o no se guarda ninguno.
export const TIPOS_MOVIMIENTO = ['inicial', 'entrada', 'salida', 'ajuste', 'venta', 'devolucion'];

export async function registrarMovimiento(ejecutor, { productoId, tipo, cantidad, motivo = null, usuarioId = null, pedidoId = null }) {
  const prod = await ejecutor.get('SELECT stock FROM producto WHERE id = ?', Number(productoId));
  if (!prod) return;
  await ejecutor.run(
    `INSERT INTO movimiento_inventario (producto_id, tipo, cantidad, stock_resultante, motivo, usuario_id, pedido_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    Number(productoId),
    tipo,
    Number(cantidad),
    Number(prod.stock),
    motivo,
    usuarioId == null ? null : Number(usuarioId),
    pedidoId == null ? null : Number(pedidoId)
  );
}
