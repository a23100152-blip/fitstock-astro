// PedidosAdmin.jsx — Módulo de pedidos del BackOffice.
// Filtros, cambio de estado de pago/envío y detalle. Los pedidos nuevos y los
// cambios llegan solos por la suscripción `pedidoActualizado`.
import { useEffect, useRef, useState } from 'react';
import { gql, useSuscripcion, SUB_PEDIDO, EnVivo, mxn, fechaHora } from './api.jsx';
import { useToast } from '../../store/useToastStore.js';

const METODO = { tarjeta: 'Tarjeta', paypal: 'PayPal', mercadopago: 'Mercado Pago', transferencia: 'Transferencia' };
const ENVIO = { procesando: 'Procesando', enviado: 'Enviado', entregado: 'Entregado', cancelado: 'Cancelado' };
const PAGO = { pendiente: 'Pago pendiente', pagado: 'Pagado', cancelado: 'Pago cancelado' };

const CAMPOS = 'id nombreContacto emailContacto metodoPago total estado estadoPago fechaCreacion';
const Q_PEDIDOS = `query($estado: String, $estadoPago: String, $busqueda: String) {
  pedidos(estado: $estado, estadoPago: $estadoPago, busqueda: $busqueda, limite: 200) { ${CAMPOS} }
}`;

export default function PedidosAdmin({ inicial = [] }) {
  const [pedidos, setPedidos] = useState(inicial);
  const [filtros, setFiltros] = useState({ estado: '', estadoPago: '', busqueda: '' });
  const [abierto, setAbierto] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [nuevos, setNuevos] = useState(() => new Set());
  const { showToast } = useToast();
  const primera = useRef(true);

  const cargar = async (f = filtros) => {
    try {
      const d = await gql(Q_PEDIDOS, { estado: f.estado || null, estadoPago: f.estadoPago || null, busqueda: f.busqueda || null });
      setPedidos(d.pedidos);
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  // Filtros: se vuelve a consultar al backend (con una pequeña espera al escribir).
  useEffect(() => {
    if (primera.current) { primera.current = false; return; }
    const t = setTimeout(() => cargar(filtros), 300);
    return () => clearTimeout(t);
  }, [filtros]);

  const estado = useSuscripcion(SUB_PEDIDO, ({ pedidoActualizado: p }) => {
    setPedidos((prev) => {
      const existe = prev.some((x) => x.id === p.id);
      if (existe) return prev.map((x) => (x.id === p.id ? { ...x, ...p } : x));
      // Pedido nuevo: solo se agrega si cumple los filtros activos.
      if (filtros.estado && p.estado !== filtros.estado) return prev;
      if (filtros.estadoPago && p.estadoPago !== filtros.estadoPago) return prev;
      return [p, ...prev];
    });
    setNuevos((prev) => new Set(prev).add(p.id));
    setTimeout(() => setNuevos((prev) => { const s = new Set(prev); s.delete(p.id); return s; }), 4000);
  });

  useEffect(() => {
    if (estado === 'conectado') cargar();
  }, [estado]);

  const cambiar = async (id, campo, valor) => {
    const mut = campo === 'estado'
      ? 'mutation($id: ID!, $v: String!) { actualizarEstadoPedido(id: $id, estado: $v) { ' + CAMPOS + ' } }'
      : 'mutation($id: ID!, $v: String!) { actualizarEstadoPago(id: $id, estadoPago: $v) { ' + CAMPOS + ' } }';
    try {
      const d = await gql(mut, { id, v: valor });
      const p = d.actualizarEstadoPedido ?? d.actualizarEstadoPago;
      setPedidos((prev) => prev.map((x) => (x.id === p.id ? p : x)));
      showToast(`Pedido #${id} actualizado`);
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const verDetalle = async (id) => {
    if (abierto === id) { setAbierto(null); return; }
    setAbierto(id);
    setDetalle(null);
    try {
      const d = await gql(`query($id: ID!) { pedido(id: $id) {
        id subtotal envio total referenciaPago fechaPago
        direccion { calle numero ciudad estado cp telefono }
        detalles { cantidad precioUnitario subtotal producto { nombre } }
      } }`, { id });
      setDetalle(d.pedido);
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const f = (k) => (e) => setFiltros((prev) => ({ ...prev, [k]: e.target.value }));

  return (
    <div className="dash-card">
      <div className="bo-toolbar">
        <input className="bo-input" placeholder="Buscar por cliente, correo o #pedido…" value={filtros.busqueda} onChange={f('busqueda')} />
        <select className="sel" value={filtros.estado} onChange={f('estado')} aria-label="Filtrar por envío">
          <option value="">Todos los envíos</option>
          {Object.entries(ENVIO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
        <select className="sel" value={filtros.estadoPago} onChange={f('estadoPago')} aria-label="Filtrar por pago">
          <option value="">Todos los pagos</option>
          {Object.entries(PAGO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
        <EnVivo estado={estado} />
      </div>

      <p className="bo-contador">{pedidos.length} pedido(s)</p>
      <div className="tabla-scroll">
        <table className="tabla-admin">
          <thead>
            <tr><th>#</th><th>Cliente</th><th>Método</th><th>Total</th><th>Pago</th><th>Envío</th><th>Fecha</th><th></th></tr>
          </thead>
          <tbody>
            {pedidos.map((p) => (
              <FilaPedido
                key={p.id} p={p} nuevo={nuevos.has(p.id)} abierto={abierto === p.id} detalle={detalle}
                onCambiar={cambiar} onDetalle={verDetalle}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="dash-nota">Cancelar un pedido devuelve su stock al inventario (queda en el kardex). Marcar una transferencia como "Pagado" la suma a las ventas.</p>
    </div>
  );
}

function FilaPedido({ p, nuevo, abierto, detalle, onCambiar, onDetalle }) {
  return (
    <>
      <tr className={nuevo ? 'fila-nueva' : ''}>
        <td>#{p.id}</td>
        <td>{p.nombreContacto}<br /><small className="celda-fecha">{p.emailContacto}</small></td>
        <td>{METODO[p.metodoPago] ?? p.metodoPago}</td>
        <td>{mxn(p.total)}</td>
        <td>
          <select className={`sel sel-pago-${p.estadoPago}`} value={p.estadoPago} onChange={(e) => onCambiar(p.id, 'estadoPago', e.target.value)} aria-label={`Pago del pedido ${p.id}`}>
            {Object.entries(PAGO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </td>
        <td>
          <select className="sel" value={p.estado} onChange={(e) => onCambiar(p.id, 'estado', e.target.value)} disabled={p.estado === 'cancelado'} aria-label={`Envío del pedido ${p.id}`}>
            {Object.entries(ENVIO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </td>
        <td className="celda-fecha">{fechaHora(p.fechaCreacion)}</td>
        <td><button type="button" className="btn-mini" onClick={() => onDetalle(p.id)}>{abierto ? 'Ocultar' : 'Ver'}</button></td>
      </tr>
      {abierto && (
        <tr className="fila-detalle">
          <td colSpan={8}>
            {!detalle ? 'Cargando…' : (
              <div className="detalle-grid">
                <div>
                  <strong>Productos</strong>
                  {detalle.detalles.map((d, i) => (
                    <div key={i} className="order-line"><span>{d.producto.nombre} × {d.cantidad}</span><span>{mxn(d.subtotal)}</span></div>
                  ))}
                  <div className="order-line"><span>Envío</span><span>{detalle.envio === 0 ? 'Gratis' : mxn(detalle.envio)}</span></div>
                  <div className="order-line"><strong>Total</strong><strong>{mxn(detalle.total)}</strong></div>
                </div>
                <div>
                  <strong>Envío a</strong>
                  <p className="detalle-txt">
                    {detalle.direccion.calle} {detalle.direccion.numero ?? ''}, {detalle.direccion.ciudad}, {detalle.direccion.estado} · CP {detalle.direccion.cp}<br />
                    Tel. {detalle.direccion.telefono}
                  </p>
                  <strong>Pago</strong>
                  <p className="detalle-txt">Referencia: {detalle.referenciaPago ?? '—'}<br />Fecha de pago: {detalle.fechaPago ? fechaHora(detalle.fechaPago) : '—'}</p>
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
