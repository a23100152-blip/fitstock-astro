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
  cerrarTodasLasSesiones,
  validarPassword,
} from './auth.js';
import { hashPassword } from './password.js';
import {
  METODOS_CON_PASARELA,
  METODOS_CON_REDIRECCION,
  crearPagoPaypal,
  verificarPagoPaypal,
  cobrarConTarjetaMercadoPago,
} from './pagos.js';
import { ahoraSQL, cancelarPedidoYRestaurarStock } from './pedidos.js';
import { calcularEstadisticas } from './estadisticas.js';
import { pubSub, CANAL, registrarEvento, notificarPedido, notificarStock } from './eventos.js';
import { registrarMovimiento, TIPOS_MOVIMIENTO } from './inventario.js';

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

// ---- BackOffice ----
const ROLES = ['cliente', 'admin'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const mxn = (n) => `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function mapUsuario(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    nombre: row.nombre,
    email: row.email,
    rol: row.rol,
    activo: row.activo === undefined ? undefined : Number(row.activo) === 1,
    fechaCreacion: row.fecha_creacion,
  };
}

function mapMovimiento(row) {
  return {
    id: row.id,
    productoId: row.producto_id,
    tipo: row.tipo,
    cantidad: row.cantidad,
    stockResultante: row.stock_resultante,
    motivo: row.motivo,
    usuario: row.usuario_nombre ?? null,
    pedidoId: row.pedido_id,
    fecha: row.fecha,
  };
}

function mapEvento(row) {
  return {
    id: row.id,
    accion: row.accion,
    entidad: row.entidad,
    entidadId: row.entidad_id,
    mensaje: row.mensaje,
    usuario: row.usuario,
    fecha: row.fecha,
  };
}

// Suscripciones: solo un admin con sesión puede escuchar el canal.
function suscripcionAdmin(canal, mapear) {
  return {
    subscribe: (_p, _a, ctx) => {
      requerirAdmin(ctx);
      return pubSub.subscribe(canal);
    },
    resolve: (fila) => mapear(fila),
  };
}

// Valida y normaliza los datos de un producto (alta y edición).
async function validarProducto(input, parcial = false) {
  if (!parcial || input.nombre !== undefined) {
    if (!input.nombre?.trim()) throw new GraphQLError('El producto necesita un nombre.');
  }
  if (input.precio != null && !(Number(input.precio) >= 0)) throw new GraphQLError('El precio no puede ser negativo.');
  if (input.stock != null && (!Number.isInteger(Number(input.stock)) || Number(input.stock) < 0)) {
    throw new GraphQLError('El stock debe ser un número entero mayor o igual a 0.');
  }
  if (input.categoriaId != null) {
    const cat = await db.get('SELECT id FROM categoria WHERE id = ?', Number(input.categoriaId));
    if (!cat) throw new GraphQLError('La categoría no existe.');
  }
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

    pedidos: async (_p, { estado, estadoPago, busqueda, limite = 200 }, ctx) => {
      requerirAdmin(ctx);
      const filtros = [];
      const args = [];
      if (estado) { filtros.push('estado = ?'); args.push(estado); }
      if (estadoPago) { filtros.push('estado_pago = ?'); args.push(estadoPago); }
      if (busqueda?.trim()) {
        const q = `%${busqueda.trim().toLowerCase()}%`;
        filtros.push('(LOWER(nombre_contacto) LIKE ? OR LOWER(email_contacto) LIKE ? OR CAST(id AS TEXT) = ?)');
        args.push(q, q, busqueda.trim().replace('#', ''));
      }
      const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
      return (
        await db.all(`SELECT * FROM pedido ${where} ORDER BY id DESC LIMIT ?`, ...args, Math.min(Number(limite) || 200, 500))
      ).map(mapPedido);
    },

    // ---- BackOffice ----
    usuarios: async (_p, { busqueda, rol }, ctx) => {
      requerirAdmin(ctx);
      const filtros = [];
      const args = [];
      if (rol) { filtros.push('rol = ?'); args.push(rol); }
      if (busqueda?.trim()) {
        const q = `%${busqueda.trim().toLowerCase()}%`;
        filtros.push('(LOWER(nombre) LIKE ? OR LOWER(email) LIKE ?)');
        args.push(q, q);
      }
      const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
      return (await db.all(`SELECT * FROM usuario ${where} ORDER BY id DESC`, ...args)).map(mapUsuario);
    },

    movimientosInventario: async (_p, { productoId, limite = 100 }, ctx) => {
      requerirAdmin(ctx);
      const tope = Math.min(Number(limite) || 100, 500);
      const sql = `SELECT m.*, u.nombre AS usuario_nombre
                     FROM movimiento_inventario m LEFT JOIN usuario u ON u.id = m.usuario_id
                    ${productoId ? 'WHERE m.producto_id = ?' : ''}
                    ORDER BY m.id DESC LIMIT ?`;
      const filas = productoId ? await db.all(sql, Number(productoId), tope) : await db.all(sql, tope);
      return filas.map(mapMovimiento);
    },

    bitacora: async (_p, { entidad, limite = 100 }, ctx) => {
      requerirAdmin(ctx);
      const tope = Math.min(Number(limite) || 100, 500);
      const filas = entidad
        ? await db.all('SELECT * FROM bitacora WHERE entidad = ? ORDER BY id DESC LIMIT ?', entidad, tope)
        : await db.all('SELECT * FROM bitacora ORDER BY id DESC LIMIT ?', tope);
      return filas.map(mapEvento);
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

  Usuario: {
    // `yo` viene de la sesión sin estos campos: se completan desde la base cuando se piden.
    activo: async (u) => {
      if (u.activo !== undefined) return u.activo;
      const r = await db.get('SELECT activo FROM usuario WHERE id = ?', Number(u.id));
      return r ? Number(r.activo) === 1 : true;
    },
    fechaCreacion: async (u) => {
      if (u.fechaCreacion !== undefined) return u.fechaCreacion;
      const r = await db.get('SELECT fecha_creacion FROM usuario WHERE id = ?', Number(u.id));
      return r?.fecha_creacion ?? null;
    },
    totalPedidos: async (u) => {
      const r = await db.get(
        "SELECT COUNT(*) AS n FROM pedido WHERE usuario_id = ? AND estado_pago = 'pagado' AND estado <> 'cancelado'",
        Number(u.id)
      );
      return Number(r?.n ?? 0);
    },
    totalGastado: async (u) => {
      const r = await db.get(
        "SELECT COALESCE(SUM(total), 0) AS t FROM pedido WHERE usuario_id = ? AND estado_pago = 'pagado' AND estado <> 'cancelado'",
        Number(u.id)
      );
      return Number(r?.t ?? 0);
    },
  },

  MovimientoInventario: {
    producto: async (m) => mapProducto(await db.get('SELECT * FROM producto WHERE id = ?', Number(m.productoId))),
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
      const admin = requerirAdmin(ctx);
      await validarProducto(input);
      const id = await db.transaccion(async (tx) => {
        const info = await tx.run(
          `INSERT INTO producto (nombre, descripcion, precio, stock, imagen_url, info_nutricional, categoria_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          input.nombre.trim(),
          input.descripcion || null,
          Number(input.precio),
          Number(input.stock),
          input.imagenUrl || null,
          input.infoNutricional || null,
          Number(input.categoriaId)
        );
        await registrarMovimiento(tx, {
          productoId: info.lastInsertRowid, tipo: 'inicial', cantidad: Number(input.stock),
          motivo: 'Alta del producto', usuarioId: admin.id,
        });
        return info.lastInsertRowid;
      });
      await registrarEvento({
        accion: 'crear', entidad: 'producto', entidadId: id, usuario: admin,
        mensaje: `Alta del producto "${input.nombre.trim()}" con ${input.stock} en stock a ${mxn(input.precio)}`,
      });
      await notificarStock(id);
      return mapProducto(await db.get('SELECT * FROM producto WHERE id = ?', id));
    },

    actualizarProducto: async (_p, { id, input }, ctx) => {
      const admin = requerirAdmin(ctx);
      const actual = await db.get('SELECT * FROM producto WHERE id = ?', Number(id));
      if (!actual) throw new GraphQLError('Producto no encontrado');
      await validarProducto(input, true);

      const next = {
        nombre: input.nombre ?? actual.nombre,
        descripcion: input.descripcion ?? actual.descripcion,
        precio: input.precio ?? actual.precio,
        stock: input.stock ?? actual.stock,
        imagen_url: input.imagenUrl ?? actual.imagen_url,
        info_nutricional: input.infoNutricional ?? actual.info_nutricional,
        categoria_id: input.categoriaId ? Number(input.categoriaId) : actual.categoria_id,
      };

      await db.transaccion(async (tx) => {
        await tx.run(
          `UPDATE producto SET nombre=?, descripcion=?, precio=?, stock=?, imagen_url=?, info_nutricional=?, categoria_id=?
           WHERE id=?`,
          next.nombre, next.descripcion, next.precio, next.stock, next.imagen_url, next.info_nutricional, next.categoria_id, Number(id)
        );
        // Si se editó el stock a mano, la diferencia queda en el kardex como ajuste.
        const diferencia = Number(next.stock) - Number(actual.stock);
        if (diferencia !== 0) {
          await registrarMovimiento(tx, {
            productoId: id, tipo: 'ajuste', cantidad: diferencia, motivo: 'Edición del producto', usuarioId: admin.id,
          });
        }
      });

      const cambios = [];
      if (next.nombre !== actual.nombre) cambios.push(`nombre "${actual.nombre}" → "${next.nombre}"`);
      if (Number(next.precio) !== Number(actual.precio)) cambios.push(`precio ${mxn(actual.precio)} → ${mxn(next.precio)}`);
      if (Number(next.stock) !== Number(actual.stock)) cambios.push(`stock ${actual.stock} → ${next.stock}`);
      if (Number(next.categoria_id) !== Number(actual.categoria_id)) cambios.push('categoría');
      if (next.descripcion !== actual.descripcion || next.imagen_url !== actual.imagen_url) cambios.push('descripción/imagen');
      await registrarEvento({
        accion: 'actualizar', entidad: 'producto', entidadId: id, usuario: admin,
        mensaje: `Producto "${next.nombre}" actualizado${cambios.length ? `: ${cambios.join(', ')}` : ''}`,
      });
      await notificarStock(id);
      return mapProducto(await db.get('SELECT * FROM producto WHERE id = ?', Number(id)));
    },

    eliminarProducto: async (_p, { id }, ctx) => {
      const admin = requerirAdmin(ctx);
      const prod = await db.get('SELECT * FROM producto WHERE id = ?', Number(id));
      if (!prod) throw new GraphQLError('Producto no encontrado.');
      const vendido = await db.get('SELECT COUNT(*) AS n FROM pedido_detalle WHERE producto_id = ?', Number(id));
      if (Number(vendido.n) > 0) {
        // Un producto con ventas no se borra: el historial de pedidos lo necesita.
        throw new GraphQLError(
          `"${prod.nombre}" aparece en ${vendido.n} pedido(s) y no se puede eliminar. Déjalo con stock 0 para retirarlo de la venta.`
        );
      }
      const info = await db.run('DELETE FROM producto WHERE id = ?', Number(id));
      await registrarEvento({
        accion: 'eliminar', entidad: 'producto', entidadId: id, usuario: admin,
        mensaje: `Se eliminó el producto "${prod.nombre}"`,
      });
      return info.changes > 0;
    },

    // ---- BackOffice: categorías ----
    crearCategoria: async (_p, { input }, ctx) => {
      const admin = requerirAdmin(ctx);
      if (!input.nombre?.trim()) throw new GraphQLError('La categoría necesita un nombre.');
      const existe = await db.get('SELECT id FROM categoria WHERE LOWER(nombre) = LOWER(?)', input.nombre.trim());
      if (existe) throw new GraphQLError('Ya existe una categoría con ese nombre.');
      const info = await db.run(
        'INSERT INTO categoria (nombre, descripcion, icono) VALUES (?, ?, ?)',
        input.nombre.trim(), input.descripcion || null, input.icono || null
      );
      await registrarEvento({
        accion: 'crear', entidad: 'categoria', entidadId: info.lastInsertRowid, usuario: admin,
        mensaje: `Nueva categoría "${input.nombre.trim()}"`,
      });
      return mapCategoria(await db.get('SELECT * FROM categoria WHERE id = ?', info.lastInsertRowid));
    },

    actualizarCategoria: async (_p, { id, input }, ctx) => {
      const admin = requerirAdmin(ctx);
      const actual = await db.get('SELECT * FROM categoria WHERE id = ?', Number(id));
      if (!actual) throw new GraphQLError('Categoría no encontrada.');
      if (!input.nombre?.trim()) throw new GraphQLError('La categoría necesita un nombre.');
      const dup = await db.get('SELECT id FROM categoria WHERE LOWER(nombre) = LOWER(?) AND id <> ?', input.nombre.trim(), Number(id));
      if (dup) throw new GraphQLError('Ya existe una categoría con ese nombre.');
      await db.run(
        'UPDATE categoria SET nombre = ?, descripcion = ?, icono = ? WHERE id = ?',
        input.nombre.trim(), input.descripcion || null, input.icono || null, Number(id)
      );
      await registrarEvento({
        accion: 'actualizar', entidad: 'categoria', entidadId: id, usuario: admin,
        mensaje: `Categoría "${actual.nombre}" actualizada${actual.nombre !== input.nombre.trim() ? ` (ahora "${input.nombre.trim()}")` : ''}`,
      });
      return mapCategoria(await db.get('SELECT * FROM categoria WHERE id = ?', Number(id)));
    },

    eliminarCategoria: async (_p, { id }, ctx) => {
      const admin = requerirAdmin(ctx);
      const cat = await db.get('SELECT * FROM categoria WHERE id = ?', Number(id));
      if (!cat) throw new GraphQLError('Categoría no encontrada.');
      const usados = await db.get('SELECT COUNT(*) AS n FROM producto WHERE categoria_id = ?', Number(id));
      if (Number(usados.n) > 0) {
        throw new GraphQLError(`"${cat.nombre}" tiene ${usados.n} producto(s). Muévelos a otra categoría antes de eliminarla.`);
      }
      await db.run('DELETE FROM categoria WHERE id = ?', Number(id));
      await registrarEvento({
        accion: 'eliminar', entidad: 'categoria', entidadId: id, usuario: admin,
        mensaje: `Se eliminó la categoría "${cat.nombre}"`,
      });
      return true;
    },

    // ---- BackOffice: inventario ----
    ajustarStock: async (_p, { productoId, cantidad, tipo, motivo }, ctx) => {
      const admin = requerirAdmin(ctx);
      if (!['entrada', 'salida', 'ajuste'].includes(tipo)) {
        throw new GraphQLError('Tipo de movimiento inválido. Usa: entrada, salida o ajuste.');
      }
      const n = Number(cantidad);
      if (!Number.isInteger(n) || n === 0) throw new GraphQLError('La cantidad debe ser un entero distinto de 0.');
      if (!motivo?.trim()) throw new GraphQLError('Escribe el motivo del movimiento.');
      // entrada siempre suma, salida siempre resta, ajuste respeta el signo.
      const delta = tipo === 'entrada' ? Math.abs(n) : tipo === 'salida' ? -Math.abs(n) : n;

      const prod = await db.transaccion(async (tx) => {
        const p = await tx.get('SELECT * FROM producto WHERE id = ?', Number(productoId));
        if (!p) throw new GraphQLError('Producto no encontrado.');
        if (Number(p.stock) + delta < 0) {
          throw new GraphQLError(`No hay suficiente stock: "${p.nombre}" tiene ${p.stock} y se quieren sacar ${Math.abs(delta)}.`);
        }
        await tx.run('UPDATE producto SET stock = stock + ? WHERE id = ?', delta, Number(productoId));
        await registrarMovimiento(tx, {
          productoId, tipo, cantidad: delta, motivo: motivo.trim(), usuarioId: admin.id,
        });
        return { ...p, stock: Number(p.stock) + delta };
      });

      await registrarEvento({
        accion: 'stock', entidad: 'inventario', entidadId: productoId, usuario: admin,
        mensaje: `${tipo === 'entrada' ? 'Entrada' : tipo === 'salida' ? 'Salida' : 'Ajuste'} de ${delta > 0 ? '+' : ''}${delta} en "${prod.nombre}" (queda en ${prod.stock}) · ${motivo.trim()}`,
      });
      await notificarStock(productoId);
      return mapProducto(await db.get('SELECT * FROM producto WHERE id = ?', Number(productoId)));
    },

    // ---- BackOffice: usuarios ----
    crearUsuarioAdmin: async (_p, { input }, ctx) => {
      const admin = requerirAdmin(ctx);
      const nombre = input.nombre?.trim() ?? '';
      const email = input.email?.trim().toLowerCase() ?? '';
      if (nombre.length < 2) throw new GraphQLError('El nombre debe tener al menos 2 caracteres.');
      if (!EMAIL_RE.test(email)) throw new GraphQLError('El correo no tiene un formato válido.');
      if (!ROLES.includes(input.rol)) throw new GraphQLError('Rol inválido. Usa cliente o admin.');
      const errPass = validarPassword(input.password, input.password);
      if (errPass) throw new GraphQLError(errPass);
      const existe = await db.get('SELECT id FROM usuario WHERE email = ?', email);
      if (existe) throw new GraphQLError('Ya existe una cuenta con ese correo.');
      const info = await db.run(
        'INSERT INTO usuario (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)',
        nombre, email, hashPassword(input.password), input.rol
      );
      await registrarEvento({
        accion: 'crear', entidad: 'usuario', entidadId: info.lastInsertRowid, usuario: admin,
        mensaje: `Alta del usuario ${nombre} <${email}> con rol ${input.rol}`,
      });
      return mapUsuario(await db.get('SELECT * FROM usuario WHERE id = ?', info.lastInsertRowid));
    },

    actualizarUsuario: async (_p, { id, input }, ctx) => {
      const admin = requerirAdmin(ctx);
      const u = await db.get('SELECT * FROM usuario WHERE id = ?', Number(id));
      if (!u) throw new GraphQLError('Usuario no encontrado.');
      const nombre = input.nombre != null ? input.nombre.trim() : u.nombre;
      const rol = input.rol ?? u.rol;
      if (nombre.length < 2) throw new GraphQLError('El nombre debe tener al menos 2 caracteres.');
      if (!ROLES.includes(rol)) throw new GraphQLError('Rol inválido. Usa cliente o admin.');
      if (Number(id) === admin.id && rol !== 'admin') {
        throw new GraphQLError('No puedes quitarte a ti mismo el rol de administrador.');
      }
      if (u.rol === 'admin' && rol !== 'admin') {
        const otros = await db.get("SELECT COUNT(*) AS n FROM usuario WHERE rol = 'admin' AND activo = 1 AND id <> ?", Number(id));
        if (Number(otros.n) === 0) throw new GraphQLError('Debe quedar al menos un administrador activo.');
      }
      await db.run('UPDATE usuario SET nombre = ?, rol = ? WHERE id = ?', nombre, rol, Number(id));
      const cambios = [];
      if (nombre !== u.nombre) cambios.push(`nombre "${u.nombre}" → "${nombre}"`);
      if (rol !== u.rol) cambios.push(`rol ${u.rol} → ${rol}`);
      await registrarEvento({
        accion: 'actualizar', entidad: 'usuario', entidadId: id, usuario: admin,
        mensaje: `Usuario ${u.email} actualizado${cambios.length ? `: ${cambios.join(', ')}` : ''}`,
      });
      return mapUsuario(await db.get('SELECT * FROM usuario WHERE id = ?', Number(id)));
    },

    cambiarEstadoUsuario: async (_p, { id, activo }, ctx) => {
      const admin = requerirAdmin(ctx);
      const u = await db.get('SELECT * FROM usuario WHERE id = ?', Number(id));
      if (!u) throw new GraphQLError('Usuario no encontrado.');
      if (Number(id) === admin.id && !activo) throw new GraphQLError('No puedes desactivar tu propia cuenta.');
      if (!activo && u.rol === 'admin') {
        const otros = await db.get("SELECT COUNT(*) AS n FROM usuario WHERE rol = 'admin' AND activo = 1 AND id <> ?", Number(id));
        if (Number(otros.n) === 0) throw new GraphQLError('Debe quedar al menos un administrador activo.');
      }
      await db.run('UPDATE usuario SET activo = ? WHERE id = ?', activo ? 1 : 0, Number(id));
      if (!activo) await cerrarTodasLasSesiones(id); // se le cierra la sesión en todos sus dispositivos
      await registrarEvento({
        accion: 'estado', entidad: 'usuario', entidadId: id, usuario: admin,
        mensaje: `Usuario ${u.email} ${activo ? 'reactivado' : 'desactivado (sesiones cerradas)'}`,
      });
      return mapUsuario(await db.get('SELECT * FROM usuario WHERE id = ?', Number(id)));
    },

    restablecerPasswordUsuario: async (_p, { id, nueva }, ctx) => {
      const admin = requerirAdmin(ctx);
      const u = await db.get('SELECT * FROM usuario WHERE id = ?', Number(id));
      if (!u) throw new GraphQLError('Usuario no encontrado.');
      const err = validarPassword(nueva, nueva);
      if (err) throw new GraphQLError(err);
      await db.run('UPDATE usuario SET password_hash = ? WHERE id = ?', hashPassword(nueva), Number(id));
      await cerrarTodasLasSesiones(id);
      await registrarEvento({
        accion: 'actualizar', entidad: 'usuario', entidadId: id, usuario: admin,
        mensaje: `Se restableció la contraseña de ${u.email} (sesiones cerradas)`,
      });
      return true;
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
          await registrarMovimiento(tx, {
            productoId: producto.id, tipo: 'venta', cantidad: -cantidad,
            motivo: `Pedido #${id}`, usuarioId: user.id, pedidoId: id,
          });
        }
        return id;
      });

      await registrarEvento({
        accion: 'pedido', entidad: 'pedido', entidadId: pedidoId, usuario: user,
        mensaje: `Nuevo pedido #${pedidoId} de ${nombreContacto} por ${mxn(total)} (${metodoPago})`,
      });
      await notificarPedido(pedidoId);
      await notificarStock(...productos.map(({ producto }) => producto.id));
      return mapPedido(await db.get('SELECT * FROM pedido WHERE id = ?', pedidoId));
    },

    actualizarEstadoPedido: async (_p, { id, estado }, ctx) => {
      const admin = requerirAdmin(ctx);
      const validos = ['procesando', 'enviado', 'entregado', 'cancelado'];
      if (!validos.includes(estado)) {
        throw new GraphQLError(`Estado inválido. Usa uno de: ${validos.join(', ')}`);
      }
      const actual = await db.get('SELECT estado FROM pedido WHERE id = ?', Number(id));
      if (!actual) throw new GraphQLError('Pedido no encontrado.');
      if (estado === 'cancelado' && actual.estado !== 'cancelado') {
        // Cancelar devuelve el stock reservado (el estado del cobro se deja como estaba: el reembolso es manual).
        await cancelarPedidoYRestaurarStock(id, null, admin.id);
      } else {
        await db.run('UPDATE pedido SET estado = ? WHERE id = ?', estado, Number(id));
        await notificarPedido(id);
      }
      if (estado !== actual.estado) {
        await registrarEvento({
          accion: 'estado', entidad: 'pedido', entidadId: id, usuario: admin,
          mensaje: `Pedido #${id}: envío ${actual.estado} → ${estado}${estado === 'cancelado' ? ' (stock devuelto)' : ''}`,
        });
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
        await registrarEvento({
          accion: 'pago', entidad: 'pedido', entidadId: row.id, usuario: ctx.user,
          mensaje: `Pago aprobado con PayPal del pedido #${row.id} por ${mxn(row.total)}`,
        });
        await notificarPedido(row.id);
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
        await registrarEvento({
          accion: 'pago', entidad: 'pedido', entidadId: row.id, usuario: ctx.user,
          mensaje: `Pago aprobado con Mercado Pago del pedido #${row.id} por ${mxn(row.total)}`,
        });
        await notificarPedido(row.id);
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
      const admin = requerirAdmin(ctx);
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
      if (estadoPago !== row.estado_pago) {
        await registrarEvento({
          accion: 'pago', entidad: 'pedido', entidadId: row.id, usuario: admin,
          mensaje: `Pedido #${row.id}: pago ${row.estado_pago} → ${estadoPago}`,
        });
      }
      await notificarPedido(row.id);
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
      if (usuarioId?.desactivado) {
        throw new GraphQLError('Tu cuenta está desactivada. Contacta al administrador de FitStock.');
      }
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
      await registrarEvento({
        accion: 'registro', entidad: 'usuario', entidadId: res.id, usuario: { id: Number(usuario.id), nombre: usuario.nombre },
        mensaje: `Nuevo cliente registrado: ${usuario.nombre} <${usuario.email}>`,
      });
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

  // ---- GraphQL Subscriptions (tiempo real del BackOffice) ----
  Subscription: {
    eventoBackoffice: suscripcionAdmin(CANAL.EVENTO, mapEvento),
    pedidoActualizado: suscripcionAdmin(CANAL.PEDIDO, mapPedido),
    stockActualizado: suscripcionAdmin(CANAL.STOCK, mapProducto),
  },
};
