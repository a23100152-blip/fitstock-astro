// estadisticas.js — Consultas agregadas para el dashboard de administrador.
// Regla de negocio: un pedido cuenta como "venta" solo si ya está PAGADO y no
// fue cancelado. Los pedidos pendientes de pago no inflan los ingresos.
import { db } from './db.js';

// Las fechas se guardan en UTC; el dashboard agrupa por día en hora local
// (por defecto UTC-6, centro de México). Se puede cambiar con TZ_OFFSET_HORAS.
const TZ_HORAS = Number(process.env.TZ_OFFSET_HORAS ?? -6);
const MOD_TZ = `${TZ_HORAS >= 0 ? '+' : ''}${TZ_HORAS} hours`;
const VENTA = "p.estado_pago = 'pagado' AND p.estado <> 'cancelado'";
const DIA_LOCAL = "date(p.fecha_creacion, ?)";

const METODOS = ['tarjeta', 'paypal', 'mercadopago', 'transferencia'];
const ESTADOS = ['procesando', 'enviado', 'entregado', 'cancelado'];

const aFechaISO = (ms) => new Date(ms).toISOString().slice(0, 10);
const num = (v) => Number(v ?? 0);

export async function calcularEstadisticas(diasSolicitados) {
  const dias = Math.min(365, Math.max(7, Math.round(diasSolicitados || 30)));
  const DIA_MS = 24 * 3600 * 1000;

  const hoyLocalMs = Date.now() + TZ_HORAS * 3600 * 1000;
  const hasta = aFechaISO(hoyLocalMs);
  const desde = aFechaISO(hoyLocalMs - (dias - 1) * DIA_MS);
  const desdeAnterior = aFechaISO(hoyLocalMs - (2 * dias - 1) * DIA_MS);
  const hastaAnterior = aFechaISO(hoyLocalMs - dias * DIA_MS);

  // --- Resumen del periodo ---
  const r = await db.get(
    `SELECT COALESCE(SUM(p.total), 0) AS ingresos, COUNT(*) AS pedidos
       FROM pedido p WHERE ${VENTA} AND ${DIA_LOCAL} BETWEEN ? AND ?`,
    MOD_TZ, desde, hasta
  );
  const anterior = await db.get(
    `SELECT COALESCE(SUM(p.total), 0) AS ingresos
       FROM pedido p WHERE ${VENTA} AND ${DIA_LOCAL} BETWEEN ? AND ?`,
    MOD_TZ, desdeAnterior, hastaAnterior
  );
  const unidades = await db.get(
    `SELECT COALESCE(SUM(d.cantidad), 0) AS unidades
       FROM pedido_detalle d JOIN pedido p ON p.id = d.pedido_id
      WHERE ${VENTA} AND ${DIA_LOCAL} BETWEEN ? AND ?`,
    MOD_TZ, desde, hasta
  );
  const pedidosTotales = await db.get(
    `SELECT COUNT(*) AS n FROM pedido p WHERE ${DIA_LOCAL} BETWEEN ? AND ?`, MOD_TZ, desde, hasta
  );
  const pendientes = await db.get(
    "SELECT COUNT(*) AS n FROM pedido WHERE estado_pago = 'pendiente' AND estado <> 'cancelado'"
  );
  const clientes = await db.get("SELECT COUNT(*) AS n FROM usuario WHERE rol = 'cliente'");
  const productos = await db.get('SELECT COUNT(*) AS n FROM producto');

  const ingresos = num(r.ingresos);
  const ingresosPrev = num(anterior.ingresos);
  const resumen = {
    ingresosTotales: ingresos,
    ingresosPeriodoAnterior: ingresosPrev,
    variacionIngresos: ingresosPrev > 0 ? ((ingresos - ingresosPrev) / ingresosPrev) * 100 : null,
    pedidosPagados: num(r.pedidos),
    pedidosTotales: num(pedidosTotales.n),
    pedidosPendientesPago: num(pendientes.n),
    ticketPromedio: num(r.pedidos) > 0 ? ingresos / num(r.pedidos) : 0,
    unidadesVendidas: num(unidades.unidades),
    clientes: num(clientes.n),
    productos: num(productos.n),
  };

  // --- Ventas por día (rellena con ceros los días sin ventas) ---
  const filasDia = await db.all(
    `SELECT ${DIA_LOCAL} AS dia, SUM(p.total) AS ingresos, COUNT(*) AS pedidos
       FROM pedido p WHERE ${VENTA} AND ${DIA_LOCAL} BETWEEN ? AND ?
      GROUP BY dia`,
    MOD_TZ, MOD_TZ, desde, hasta
  );
  const porDia = new Map(filasDia.map((f) => [f.dia, f]));
  const ventasPorDia = [];
  for (let i = dias - 1; i >= 0; i--) {
    const fecha = aFechaISO(hoyLocalMs - i * DIA_MS);
    const f = porDia.get(fecha);
    ventasPorDia.push({ fecha, ingresos: num(f?.ingresos), pedidos: num(f?.pedidos) });
  }

  // --- Ventas por método de pago ---
  const filasMetodo = await db.all(
    `SELECT p.metodo_pago AS metodo, SUM(p.total) AS ingresos, COUNT(*) AS pedidos
       FROM pedido p WHERE ${VENTA} AND ${DIA_LOCAL} BETWEEN ? AND ?
      GROUP BY p.metodo_pago`,
    MOD_TZ, desde, hasta
  );
  const ventasPorMetodo = METODOS.map((m) => {
    const f = filasMetodo.find((x) => x.metodo === m);
    return { metodo: m, ingresos: num(f?.ingresos), pedidos: num(f?.pedidos) };
  });

  // --- Ventas por categoría ---
  const filasCategoria = await db.all(
    `SELECT c.nombre AS categoria, SUM(d.subtotal) AS ingresos, SUM(d.cantidad) AS unidades
       FROM pedido_detalle d
       JOIN pedido p ON p.id = d.pedido_id
       JOIN producto pr ON pr.id = d.producto_id
       JOIN categoria c ON c.id = pr.categoria_id
      WHERE ${VENTA} AND ${DIA_LOCAL} BETWEEN ? AND ?
      GROUP BY c.id ORDER BY ingresos DESC`,
    MOD_TZ, desde, hasta
  );
  const ventasPorCategoria = filasCategoria.map((f) => ({
    categoria: f.categoria, ingresos: num(f.ingresos), unidades: num(f.unidades),
  }));

  // --- Productos más vendidos ---
  const filasTop = await db.all(
    `SELECT pr.nombre AS producto, SUM(d.cantidad) AS unidades, SUM(d.subtotal) AS ingresos
       FROM pedido_detalle d
       JOIN pedido p ON p.id = d.pedido_id
       JOIN producto pr ON pr.id = d.producto_id
      WHERE ${VENTA} AND ${DIA_LOCAL} BETWEEN ? AND ?
      GROUP BY pr.id ORDER BY unidades DESC, ingresos DESC LIMIT 5`,
    MOD_TZ, desde, hasta
  );
  const productosMasVendidos = filasTop.map((f) => ({
    producto: f.producto, unidades: num(f.unidades), ingresos: num(f.ingresos),
  }));

  // --- Pedidos por estado de envío ---
  const filasEstado = await db.all(
    `SELECT p.estado AS estado, COUNT(*) AS pedidos FROM pedido p
      WHERE ${DIA_LOCAL} BETWEEN ? AND ? GROUP BY p.estado`,
    MOD_TZ, desde, hasta
  );
  const pedidosPorEstado = ESTADOS.map((e) => ({
    estado: e, pedidos: num(filasEstado.find((x) => x.estado === e)?.pedidos),
  }));

  // --- Inventario y pedidos recientes ---
  const stockBajo = await db.all('SELECT * FROM producto WHERE stock <= 10 ORDER BY stock ASC, nombre LIMIT 8');
  const pedidosRecientes = await db.all('SELECT * FROM pedido ORDER BY id DESC LIMIT 10');

  return {
    dias, desde, hasta, resumen,
    ventasPorDia, ventasPorMetodo, ventasPorCategoria, productosMasVendidos,
    pedidosPorEstado, stockBajo, pedidosRecientes,
  };
}
