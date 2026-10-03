// resolvers.js — Lógica de negocio del backend.
// El punto crítico para la práctica es `crearPedido`: valida stock,
// calcula totales en el servidor (nunca confía en el precio que manda
// el cliente) y persiste todo en una transacción real (libSQL/Turso).
import { db } from './db.js';
import { GraphQLError } from 'graphql';

// ---- Autorización (usa el usuario que pone la sesión en el contexto) ----
function requerirUsuario(ctx) {
  if (!ctx?.user) {
    throw new GraphQLError('Debes iniciar sesión para continuar.', { extensions: { code: 'UNAUTHENTICATED' } });
  }
  return ctx.user;
}

function requerirAdmin(ctx) {
  const user = requerirUsuario(ctx);
  if (user.rol !== 'admin') {
    throw new GraphQLError('No tienes permisos para esta operación.', { extensions: { code: 'FORBIDDEN' } });
  }
  return user;
}

const COSTO_ENVIO = 99;
const ENVIO_GRATIS_DESDE = 999;

function mapProducto(row) {
  if (!row) return null;
  return {
    id: row.id,
    nombre: row.nombre,
    descripcion: row.descripcion,
    precio: row.precio,
    stock: row.stock,
    imagenUrl: row.imagen_url,
    infoNutricional: row.info_nutricional,
    categoriaId: row.categoria_id,
  };
}

function mapCategoria(row) {
  if (!row) return null;
  return { id: row.id, nombre: row.nombre, descripcion: row.descripcion, icono: row.icono };
}

function mapDireccion(row) {
  if (!row) return null;
  return {
    id: row.id,
    calle: row.calle,
    numero: row.numero,
    ciudad: row.ciudad,
    estado: row.estado,
    cp: row.cp,
    pais: row.pais,
    telefono: row.telefono,
  };
}

function mapPedido(row) {
  if (!row) return null;
  return {
    id: row.id,
    nombreContacto: row.nombre_contacto,
    emailContacto: row.email_contacto,
    metodoPago: row.metodo_pago,
    subtotal: row.subtotal,
    envio: row.envio,
    total: row.total,
    estado: row.estado,
    fechaCreacion: row.fecha_creacion,
    direccionId: row.direccion_id,
    usuarioId: row.usuario_id,
  };
}

export const resolvers = {
  Query: {
    categorias: async () => (await db.all('SELECT * FROM categoria ORDER BY id')).map(mapCategoria),

    categoria: async (_p, { id }) =>
      mapCategoria(await db.get('SELECT * FROM categoria WHERE id = ?', Number(id))),

    productos: async (_p, { categoriaId }) => {
      if (categoriaId) {
        return (await db.all('SELECT * FROM producto WHERE categoria_id = ? ORDER BY id', Number(categoriaId))).map(
          mapProducto
        );
      }
      return (await db.all('SELECT * FROM producto ORDER BY id')).map(mapProducto);
    },

    producto: async (_p, { id }) =>
      mapProducto(await db.get('SELECT * FROM producto WHERE id = ?', Number(id))),

    yo: (_p, _a, ctx) => ctx.user ?? null,

    misPedidos: async (_p, _a, ctx) => {
      const user = requerirUsuario(ctx);
      return (await db.all('SELECT * FROM pedido WHERE usuario_id = ? ORDER BY id DESC', user.id)).map(mapPedido);
    },

    pedido: async (_p, { id }, ctx) => {
      const user = requerirUsuario(ctx);
      const row = await db.get('SELECT * FROM pedido WHERE id = ?', Number(id));
      if (!row) return null;
      if (Number(row.usuario_id) !== user.id && user.rol !== 'admin') {
        throw new GraphQLError('No tienes permisos para ver este pedido.', { extensions: { code: 'FORBIDDEN' } });
      }
      return mapPedido(row);
    },

    pedidos: async (_p, _a, ctx) => {
      requerirAdmin(ctx);
      return (await db.all('SELECT * FROM pedido ORDER BY id DESC')).map(mapPedido);
    },
  },

  Categoria: {
    productos: async (categoria) =>
      (await db.all('SELECT * FROM producto WHERE categoria_id = ? ORDER BY id', Number(categoria.id))).map(
        mapProducto
      ),
  },

  Producto: {
    categoria: async (producto) =>
      mapCategoria(await db.get('SELECT * FROM categoria WHERE id = ?', Number(producto.categoriaId))),
  },

  Pedido: {
    direccion: async (pedido) =>
      mapDireccion(await db.get('SELECT * FROM direccion WHERE id = ?', Number(pedido.direccionId))),
    detalles: async (pedido) =>
      (await db.all('SELECT * FROM pedido_detalle WHERE pedido_id = ?', Number(pedido.id))).map((row) => ({
        id: row.id,
        productoId: row.producto_id,
        cantidad: row.cantidad,
        precioUnitario: row.precio_unitario,
        subtotal: row.subtotal,
      })),
  },

  DetallePedido: {
    producto: async (detalle) =>
      mapProducto(await db.get('SELECT * FROM producto WHERE id = ?', Number(detalle.productoId))),
  },

  Mutation: {
    crearProducto: async (_p, { input }, ctx) => {
      requerirAdmin(ctx);
      const info = await db.run(
        `INSERT INTO producto (nombre, descripcion, precio, stock, imagen_url, info_nutricional, categoria_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        input.nombre,
        input.descripcion ?? null,
        input.precio,
        input.stock,
        input.imagenUrl ?? null,
        input.infoNutricional ?? null,
        Number(input.categoriaId)
      );
      return mapProducto(await db.get('SELECT * FROM producto WHERE id = ?', info.lastInsertRowid));
    },

    actualizarProducto: async (_p, { id, input }, ctx) => {
      requerirAdmin(ctx);
      const actual = await db.get('SELECT * FROM producto WHERE id = ?', Number(id));
      if (!actual) throw new GraphQLError('Producto no encontrado');

      const next = {
        nombre: input.nombre ?? actual.nombre,
        descripcion: input.descripcion ?? actual.descripcion,
        precio: input.precio ?? actual.precio,
        stock: input.stock ?? actual.stock,
        imagen_url: input.imagenUrl ?? actual.imagen_url,
        info_nutricional: input.infoNutricional ?? actual.info_nutricional,
        categoria_id: input.categoriaId ? Number(input.categoriaId) : actual.categoria_id,
      };

      await db.run(
        `UPDATE producto SET nombre=?, descripcion=?, precio=?, stock=?, imagen_url=?, info_nutricional=?, categoria_id=?
         WHERE id=?`,
        next.nombre, next.descripcion, next.precio, next.stock, next.imagen_url, next.info_nutricional, next.categoria_id, Number(id)
      );

      return mapProducto(await db.get('SELECT * FROM producto WHERE id = ?', Number(id)));
    },

    eliminarProducto: async (_p, { id }, ctx) => {
      requerirAdmin(ctx);
      const info = await db.run('DELETE FROM producto WHERE id = ?', Number(id));
      return info.changes > 0;
    },

    crearPedido: async (_p, { input }, ctx) => {
      const user = requerirUsuario(ctx);
      const { nombreContacto, emailContacto, metodoPago, direccion, items } = input;

      if (!items || items.length === 0) {
        throw new GraphQLError('El pedido no puede tener 0 productos.');
      }

      // 1) Traer productos y validar stock ANTES de tocar la base de datos.
      const productos = [];
      for (const item of items) {
        const producto = await db.get('SELECT * FROM producto WHERE id = ?', Number(item.productoId));
        if (!producto) {
          throw new GraphQLError(`El producto ${item.productoId} no existe.`);
        }
        if (item.cantidad <= 0) {
          throw new GraphQLError(`Cantidad inválida para "${producto.nombre}".`);
        }
        if (producto.stock < item.cantidad) {
          throw new GraphQLError(
            `Stock insuficiente para "${producto.nombre}". Disponible: ${producto.stock}, solicitado: ${item.cantidad}.`
          );
        }
        productos.push({ producto, cantidad: item.cantidad });
      }

      // 2) Calcular totales en el servidor (nunca confiar en el precio del cliente).
      const subtotal = productos.reduce((acc, { producto, cantidad }) => acc + producto.precio * cantidad, 0);
      const envio = subtotal >= ENVIO_GRATIS_DESDE ? 0 : COSTO_ENVIO;
      const total = subtotal + envio;

      // 3) Transacción real: dirección + pedido + detalle + descuento de stock.
      const pedidoId = await db.transaccion(async (tx) => {
        const dirInfo = await tx.run(
          `INSERT INTO direccion (calle, numero, ciudad, estado, cp, pais, telefono) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          direccion.calle,
          direccion.numero ?? null,
          direccion.ciudad,
          direccion.estado,
          direccion.cp,
          direccion.pais ?? 'México',
          direccion.telefono
        );

        const pedidoInfo = await tx.run(
          `INSERT INTO pedido (usuario_id, direccion_id, nombre_contacto, email_contacto, metodo_pago, subtotal, envio, total, estado)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'procesando')`,
          user.id, dirInfo.lastInsertRowid, nombreContacto, emailContacto, metodoPago, subtotal, envio, total
        );
        const id = pedidoInfo.lastInsertRowid;

        for (const { producto, cantidad } of productos) {
          await tx.run(
            `INSERT INTO pedido_detalle (pedido_id, producto_id, cantidad, precio_unitario, subtotal)
             VALUES (?, ?, ?, ?, ?)`,
            id, producto.id, cantidad, producto.precio, producto.precio * cantidad
          );
          await tx.run('UPDATE producto SET stock = stock - ? WHERE id = ?', cantidad, producto.id);
        }
        return id;
      });

      return mapPedido(await db.get('SELECT * FROM pedido WHERE id = ?', pedidoId));
    },

    actualizarEstadoPedido: async (_p, { id, estado }, ctx) => {
      requerirAdmin(ctx);
      const validos = ['procesando', 'enviado', 'entregado', 'cancelado'];
      if (!validos.includes(estado)) {
        throw new GraphQLError(`Estado inválido. Usa uno de: ${validos.join(', ')}`);
      }
      await db.run('UPDATE pedido SET estado = ? WHERE id = ?', estado, Number(id));
      return mapPedido(await db.get('SELECT * FROM pedido WHERE id = ?', Number(id)));
    },
  },
};
