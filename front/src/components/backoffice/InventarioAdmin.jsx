// InventarioAdmin.jsx — Kardex de inventario del BackOffice.
// Muestra cada movimiento de stock (inicial, entrada, salida, ajuste, venta,
// devolución) y se refresca solo cuando la suscripción `stockActualizado` avisa de un cambio.
import { useEffect, useRef, useState } from 'react';
import { gql, useSuscripcion, SUB_STOCK, EnVivo, fechaHora } from './api.jsx';

const TIPOS = {
  inicial: 'Inicial', entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste', venta: 'Venta', devolucion: 'Devolución',
};
const Q_MOV = `query($p: ID) { movimientosInventario(productoId: $p, limite: 200) {
  id tipo cantidad stockResultante motivo usuario pedidoId fecha producto { id nombre }
} }`;

export default function InventarioAdmin({ inicial = [], productos: prodIniciales = [] }) {
  const [movs, setMovs] = useState(inicial);
  const [productos, setProductos] = useState(prodIniciales);
  const [productoId, setProductoId] = useState('');
  const [tipo, setTipo] = useState('');
  const [nuevos, setNuevos] = useState(() => new Set());
  const ultimoId = useRef(Math.max(0, ...inicial.map((m) => Number(m.id))));
  const espera = useRef(null);

  const cargar = async (pid = productoId) => {
    const d = await gql(Q_MOV, { p: pid || null });
    const frescos = d.movimientosInventario.filter((m) => Number(m.id) > ultimoId.current).map((m) => m.id);
    if (frescos.length && ultimoId.current > 0) {
      setNuevos(new Set(frescos));
      setTimeout(() => setNuevos(new Set()), 4000);
    }
    ultimoId.current = Math.max(ultimoId.current, ...d.movimientosInventario.map((m) => Number(m.id)));
    setMovs(d.movimientosInventario);
  };

  useEffect(() => { cargar(productoId); }, [productoId]);

  const estado = useSuscripcion(SUB_STOCK, ({ stockActualizado: p }) => {
    setProductos((prev) => prev.map((x) => (x.id === p.id ? { ...x, stock: p.stock } : x)));
    clearTimeout(espera.current); // varios cambios seguidos (un pedido con 3 productos) = una sola recarga
    espera.current = setTimeout(() => cargar(), 250);
  });

  useEffect(() => {
    if (estado === 'conectado') cargar();
  }, [estado]);

  const visibles = tipo ? movs.filter((m) => m.tipo === tipo) : movs;
  const bajos = productos.filter((p) => p.stock <= 10).sort((a, b) => a.stock - b.stock);

  return (
    <>
      <div className="dash-card">
        <h3>⚠️ Por resurtir <small>(10 unidades o menos)</small></h3>
        {bajos.length === 0 ? <p className="dash-vacio">Todo el inventario está en buen nivel. ✔</p> : (
          <ul className="stock-lista">
            {bajos.map((p) => (
              <li key={p.id}>
                <span>{p.nombre}</span>
                <span className={`stock-pill ${p.stock <= 5 ? 'stock-critico' : ''}`}>{p.stock} en stock</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="dash-card">
        <div className="bo-toolbar">
          <h3 style={{ margin: 0 }}>Kardex de movimientos</h3>
          <select className="sel" value={productoId} onChange={(e) => setProductoId(e.target.value)} aria-label="Filtrar por producto">
            <option value="">Todos los productos</option>
            {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <select className="sel" value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Filtrar por tipo">
            <option value="">Todos los tipos</option>
            {Object.entries(TIPOS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
          <EnVivo estado={estado} />
        </div>
        <div className="tabla-scroll">
          <table className="tabla-admin">
            <thead>
              <tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Cantidad</th><th>Stock final</th><th>Motivo</th><th>Usuario</th></tr>
            </thead>
            <tbody>
              {visibles.map((m) => (
                <tr key={m.id} className={nuevos.has(m.id) ? 'fila-nueva' : ''}>
                  <td className="celda-fecha">{fechaHora(m.fecha)}</td>
                  <td>{m.producto?.nombre ?? '—'}</td>
                  <td><span className={`tag tag-${m.tipo}`}>{TIPOS[m.tipo] ?? m.tipo}</span></td>
                  <td className={m.cantidad > 0 ? 'texto-ok' : m.cantidad < 0 ? 'texto-error' : ''}>{m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}</td>
                  <td>{m.stockResultante}</td>
                  <td>{m.motivo ?? '—'}{m.pedidoId ? <small className="celda-fecha"> · pedido #{m.pedidoId}</small> : null}</td>
                  <td>{m.usuario ?? 'Sistema'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visibles.length === 0 && <p className="dash-vacio">No hay movimientos con esos filtros.</p>}
        <p className="dash-nota">Las entradas, salidas y ajustes se registran desde Productos → "± Stock". Las ventas y devoluciones se registran solas con cada pedido.</p>
      </div>
    </>
  );
}
