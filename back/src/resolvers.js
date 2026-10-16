// resolvers.js — Lógica de negocio del backend.
// El punto crítico para la práctica es `crearPedido`: valida stock,
// calcula totales en el servidor (nunca confía en el precio que manda
// el cliente) y persiste todo en una transacción real (libSQL/Turso).
import { db } from './db.js';
import { GraphQLError } from 'graphql';
import {
  crearSesion,
  destruirSesion,
  autenticar,
  registrarUsuarioDb,
  validarRegistro,
  validarNombre,
  minutosDeBloqueo,
  registrarIntentoFallido,
  limpiarIntentos,
  actualizarNombreDb,
  cambiarPasswordDb,
} from './auth.js';
import {
  METODOS_CON_PASARELA,
  METODOS_CON_REDIRECCION,
  crearPagoPaypal,
  verificarPagoPaypal,
  cobrarConTarjetaMercadoPago,
} from './pagos.js';
import { ahoraSQL, cancelarPedidoYRestaurarStock } from './pedidos.js';
import { calcularEstadisticas } from './estadisticas.js';

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

// Carga un pedido que debe pertenecer al usuario con sesión (para operaciones de cobro).
async function pedidoPropio(ctx, pedidoId) {
  const user = requerirUsuario(ctx);
  const row = await db.get('SELECT * FROM pedido WHERE id = ?', Number(pedidoId));
  if (!row || Number(row.usuario_id) !== user.id) {
    throw new GraphQLError('Pedido no encontrado.', { extensions: { code: 'NOT_FOUND' } });
  }
  return row;
}

const METODOS_PAGO = ['tarjeta', 'paypal', 'mercadopago', 'transferencia'];
const ESTADOS_PAGO = ['pendiente', 'pagado', 'cancelado'];

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
    estadoPago: row.estado_pago,
    referenciaPago: row.referencia_pago ?? null,
    fechaPago: row.fecha_pago ?? null,
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
      // Los intentos de pago que nunca se completaron (rechazados o cancelados) no son pedidos del cliente.
      return (
        await db.all("SELECT * FROM pedido WHERE usuario_id = ? AND estado_pago <> 'cancelado' ORDER BY id DESC", user.id)
      ).map(mapPedido);
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

    estadisticasAdmin: async (_p, { dias }, ctx) => {
      requerirAdmin(ctx);
      const e = await calcularEstadisticas(dias);
      return {
        ...e,
        stockBajo: e.stockBajo.map(mapProducto),
        pedidosRecientes: e.pedidosRecientes.map(mapPedido),
      };
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
      if (!METODOS_PAGO.includes(metodoPago)) {
        throw new GraphQLError(`Método de pago inválido. Usa uno de: ${METODOS_PAGO.join(', ')}`);
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

        // Tarjeta: el formulario ya se validó en el checkout (cobro simulado) → nace pagado.
        // PayPal / Mercado Pago / transferencia: nace pendiente hasta que se confirme el cobro.
        const nacePagado = metodoPago === 'tarjeta';
        const pedidoInfo = await tx.run(
          `INSERT INTO pedido (usuario_id, direccion_id, nombre_contacto, email_contacto, metodo_pago, subtotal, envio, total, estado, estado_pago, fecha_pago)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'procesando', ?, ?)`,
          user.id, dirInfo.lastInsertRowid, nombreContacto, emailContacto, metodoPago, subtotal, envio, total,
          nacePagado ? 'pagado' : 'pendiente', nacePagado ? ahoraSQL() : null
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
      const actual = await db.get('SELECT estado FROM pedido WHERE id = ?', Number(id));
      if (!actual) throw new GraphQLError('Pedido no encontrado.');
      if (estado === 'cancelado' && actual.estado !== 'cancelado') {
        // Cancelar devuelve el stock reservado (el estado del cobro se deja como estaba: el reembolso es manual).
        await cancelarPedidoYRestaurarStock(id, null);
      } else {
        await db.run('UPDATE pedido SET estado = ? WHERE id = ?', estado, Number(id));
      }
      return mapPedido(await db.get('SELECT * FROM pedido WHERE id = ?', Number(id)));
    },

    // ---- Métodos de cobro: PayPal y Mercado Pago ----
    // PayPal: crea la orden y devuelve la URL a la que se redirige al cliente.
    // (Mercado Pago ya no redirige: se cobra con pagarConTarjetaMP.)
    iniciarPago: async (_p, { pedidoId }, ctx) => {
      const row = await pedidoPropio(ctx, pedidoId);
      if (!METODOS_CON_REDIRECCION.includes(row.metodo_pago)) {
        throw new GraphQLError('Este pedido no se paga con una pasarela de redirección.');
      }
      if (row.estado_pago === 'pagado') throw new GraphQLError('Este pedido ya está pagado.');
      if (row.estado_pago === 'cancelado' || row.estado === 'cancelado') {
        throw new GraphQLError('Este pedido fue cancelado. Vuelve a hacer tu compra.');
      }

      const inicio = await crearPagoPaypal(mapPedido(row));
      await db.run('UPDATE pedido SET referencia_pago = ? WHERE id = ?', inicio.referencia, row.id);
      return { metodo: row.metodo_pago, modo: inicio.modo, urlPago: inicio.urlPago, referencia: inicio.referencia };
    },

    // PayPal: al volver de la pasarela, verifica el pago con ella.
    confirmarPago: async (_p, { pedidoId, referencia }, ctx) => {
      const row = await pedidoPropio(ctx, pedidoId);
      if (row.estado_pago === 'pagado') return mapPedido(row); // idempotente: recargar la página no cobra dos veces
      if (!METODOS_CON_REDIRECCION.includes(row.metodo_pago)) {
        throw new GraphQLError('Este pedido no se paga con una pasarela de redirección.');
      }
      if (row.estado_pago === 'cancelado' || row.estado === 'cancelado') {
        throw new GraphQLError('Este pedido fue cancelado y ya no puede pagarse.');
      }

      const resultado = await verificarPagoPaypal(mapPedido(row), referencia);
      if (resultado.pagado) {
        await db.run(
          "UPDATE pedido SET estado_pago = 'pagado', referencia_pago = ?, fecha_pago = ? WHERE id = ? AND estado_pago = 'pendiente'",
          resultado.referencia, ahoraSQL(), row.id
        );
      } else if (resultado.rechazado) {
        // PayPal no cobró (no aprobó o rechazó la tarjeta/cuenta): el pedido se cancela y el stock regresa.
        await cancelarPedidoYRestaurarStock(row.id, 'cancelado');
      }
      return mapPedido(await db.get('SELECT * FROM pedido WHERE id = ?', row.id));
    },

    // Mercado Pago (Checkout API, formulario propio): recibe el TOKEN de la tarjeta que generó
    // el navegador y cobra el pedido. Se puede reintentar con otra tarjeta mientras siga pendiente.
    pagarConTarjetaMP: async (_p, { pedidoId, input }, ctx) => {
      const row = await pedidoPropio(ctx, pedidoId);
      if (row.metodo_pago !== 'mercadopago') {
        throw new GraphQLError('Este pedido no se paga con Mercado Pago.');
      }
      if (row.estado_pago === 'pagado') throw new GraphQLError('Este pedido ya está pagado.');
      if (row.estado_pago === 'cancelado' || row.estado === 'cancelado') {
        throw new GraphQLError('Este pedido fue cancelado. Vuelve a hacer tu compra.');
      }

      let cobro;
      try {
        cobro = await cobrarConTarjetaMercadoPago(mapPedido(row), input);
      } catch (err) {
        // Error con Mercado Pago (token inválido, configuración, red): el pedido NO se queda vivo.
        await cancelarPedidoYRestaurarStock(row.id, 'cancelado');
        throw new GraphQLError(err.message);
      }

      if (cobro.aprobado) {
        await db.run(
          "UPDATE pedido SET estado_pago = 'pagado', referencia_pago = ?, fecha_pago = ? WHERE id = ? AND estado_pago = 'pendiente'",
          cobro.referencia, ahoraSQL(), row.id
        );
      } else {
        // Rechazado o pendiente: el pedido NO se completa. Se cancela y el stock se devuelve.
        // Si el cliente prueba con otra tarjeta, el checkout crea un pedido nuevo.
        await db.run('UPDATE pedido SET referencia_pago = ? WHERE id = ?', cobro.referencia, row.id);
        await cancelarPedidoYRestaurarStock(row.id, 'cancelado');
      }

      return {
        estadoPasarela: cobro.estadoPasarela,
        aprobado: cobro.aprobado,
        mensaje: cobro.mensaje,
        pedido: mapPedido(await db.get('SELECT * FROM pedido WHERE id = ?', row.id)),
      };
    },

    cancelarPago: async (_p, { pedidoId }, ctx) => {
      const row = await pedidoPropio(ctx, pedidoId);
      if (!METODOS_CON_PASARELA.includes(row.metodo_pago)) {
        throw new GraphQLError('Este pedido no se paga con PayPal ni Mercado Pago.');
      }
      if (row.estado_pago === 'pagado') throw new GraphQLError('Este pedido ya está pagado y no se puede cancelar desde aquí.');
      await cancelarPedidoYRestaurarStock(row.id, 'cancelado');
      return mapPedido(await db.get('SELECT * FROM pedido WHERE id = ?', row.id));
    },

    actualizarEstadoPago: async (_p, { id, estadoPago }, ctx) => {
      requerirAdmin(ctx);
      if (!ESTADOS_PAGO.includes(estadoPago)) {
        throw new GraphQLError(`Estado de pago inválido. Usa uno de: ${ESTADOS_PAGO.join(', ')}`);
      }
      const row = await db.get('SELECT * FROM pedido WHERE id = ?', Number(id));
      if (!row) throw new GraphQLError('Pedido no encontrado.');
      if (estadoPago === 'pagado') {
        await db.run(
          "UPDATE pedido SET estado_pago = 'pagado', fecha_pago = COALESCE(fecha_pago, ?), referencia_pago = COALESCE(referencia_pago, 'CONFIRMADO-ADMIN') WHERE id = ?",
          ahoraSQL(), row.id
        );
      } else {
        await db.run('UPDATE pedido SET estado_pago = ?, fecha_pago = NULL WHERE id = ?', estadoPago, row.id);
      }
      return mapPedido(await db.get('SELECT * FROM pedido WHERE id = ?', row.id));
    },

    // ---- Auth System ----
    iniciarSesion: async (_p, { email, password }) => {
      const minutos = await minutosDeBloqueo(email);
      if (minutos > 0) {
        throw new GraphQLError(
          `Demasiados intentos fallidos. Intenta de nuevo en ${minutos} minuto${minutos === 1 ? '' : 's'}.`
        );
      }

      const usuarioId = await autenticar(email, password);
      if (!usuarioId) {
        await registrarIntentoFallido(email);
        throw new GraphQLError('Correo o contraseña incorrectos.');
      }

      await limpiarIntentos(email);
      const token = await crearSesion(usuarioId);
      const usuario = await db.get('SELECT id, nombre, email, rol FROM usuario WHERE id = ?', usuarioId);
      return { token, usuario: { id: Number(usuario.id), nombre: usuario.nombre, email: usuario.email, rol: usuario.rol } };
    },

    registrarUsuario: async (_p, { nombre, email, password, confirm }) => {
      const errorValidacion = validarRegistro({ nombre, email, password, confirm });
      if (errorValidacion) throw new GraphQLError(errorValidacion);

      const res = await registrarUsuarioDb({ nombre, email, password });
      if (res.error) throw new GraphQLError(res.error);

      const token = await crearSesion(res.id);
      const usuario = await db.get('SELECT id, nombre, email, rol FROM usuario WHERE id = ?', res.id);
      return { token, usuario: { id: Number(usuario.id), nombre: usuario.nombre, email: usuario.email, rol: usuario.rol } };
    },

    cerrarSesion: async (_p, _a, ctx) => {
      if (ctx.token) await destruirSesion(ctx.token);
      return true;
    },

    actualizarNombre: async (_p, { nombre }, ctx) => {
      const user = requerirUsuario(ctx);
      const err = validarNombre(nombre);
      if (err) throw new GraphQLError(err);
      await actualizarNombreDb(user.id, nombre);
      return { id: user.id, nombre: nombre.trim(), email: user.email, rol: user.rol };
    },

    cambiarPassword: async (_p, { actual, nueva, confirm }, ctx) => {
      const user = requerirUsuario(ctx);
      const err = await cambiarPasswordDb(user.id, ctx.token, { actual, nueva, confirm });
      if (err) throw new GraphQLError(err);
      return true;
    },
  },
};
