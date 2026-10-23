// ProductosAdmin.jsx — Módulo de productos del BackOffice (catálogo).
// Alta, edición, baja y movimientos de stock. El stock se actualiza solo con la
// suscripción `stockActualizado` (por ejemplo, cuando un cliente compra).
import { useEffect, useState } from 'react';
import { gql, useSuscripcion, SUB_STOCK, EnVivo, mxn } from './api.jsx';
import { useToast } from '../../store/useToastStore.js';
import { resolveImage } from '../../data/imageMap.js';
import Modal from './Modal.jsx';

const CAMPOS = 'id nombre descripcion precio stock imagenUrl infoNutricional categoria { id nombre }';
const Q_PRODUCTOS = `{ productos { ${CAMPOS} } }`;
const VACIO = { nombre: '', descripcion: '', precio: '', stock: '', categoriaId: '', imagenUrl: '' };

export default function ProductosAdmin({ inicial = [], categorias = [] }) {
  const [productos, setProductos] = useState(inicial);
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState('');
  const [soloBajo, setSoloBajo] = useState(false);
  const [editando, setEditando] = useState(null); // null | 'nuevo' | producto
  const [ajustando, setAjustando] = useState(null);
  const [cambiados, setCambiados] = useState(() => new Set());
  const { showToast } = useToast();

  const cargar = async () => {
    try {
      setProductos((await gql(Q_PRODUCTOS)).productos);
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const estado = useSuscripcion(SUB_STOCK, ({ stockActualizado: p }) => {
    setProductos((prev) => {
      if (!prev.some((x) => x.id === p.id)) { cargar(); return prev; } // producto nuevo creado en otra pestaña
      return prev.map((x) => (x.id === p.id ? { ...x, ...p } : x));
    });
    setCambiados((prev) => new Set(prev).add(p.id));
    setTimeout(() => setCambiados((prev) => { const s = new Set(prev); s.delete(p.id); return s; }), 3000);
  });

  useEffect(() => {
    if (estado === 'conectado') cargar();
  }, [estado]);

  const eliminar = async (p) => {
    if (!confirm(`¿Eliminar "${p.nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
      await gql('mutation($id: ID!) { eliminarProducto(id: $id) }', { id: p.id });
      setProductos((prev) => prev.filter((x) => x.id !== p.id));
      showToast('Producto eliminado');
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const q = busqueda.trim().toLowerCase();
  const visibles = productos.filter((p) =>
    (!q || p.nombre.toLowerCase().includes(q)) &&
    (!categoria || p.categoria?.id === categoria) &&
    (!soloBajo || p.stock <= 10)
  );
  const valorInventario = productos.reduce((s, p) => s + p.precio * p.stock, 0);

  return (
    <div className="dash-card">
      <div className="bo-toolbar">
        <input className="bo-input" placeholder="Buscar producto…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <select className="sel" value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Filtrar por categoría">
          <option value="">Todas las categorías</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>)}
        </select>
        <label className="bo-check"><input type="checkbox" checked={soloBajo} onChange={(e) => setSoloBajo(e.target.checked)} /> Stock bajo</label>
        <EnVivo estado={estado} />
        <button type="button" className="btn btn-primary bo-derecha" onClick={() => setEditando('nuevo')}>+ Nuevo producto</button>
      </div>

      <p className="bo-contador">
        {visibles.length} de {productos.length} productos · Valor del inventario: <strong>{mxn(valorInventario)}</strong>
      </p>

      <div className="tabla-scroll">
        <table className="tabla-admin">
          <thead>
            <tr><th></th><th>Producto</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {visibles.map((p) => (
              <tr key={p.id} className={cambiados.has(p.id) ? 'fila-nueva' : ''}>
                <td>{p.imagenUrl ? <img className="bo-thumb" src={resolveImage(p.imagenUrl)} alt="" /> : <span className="bo-thumb bo-thumb-vacio">📦</span>}</td>
                <td><strong>{p.nombre}</strong><br /><small className="celda-fecha">ID {p.id}</small></td>
                <td>{p.categoria?.nombre}</td>
                <td>{mxn(p.precio)}</td>
                <td><span className={`stock-pill ${p.stock <= 5 ? 'stock-critico' : p.stock > 10 ? 'stock-ok' : ''}`}>{p.stock}</span></td>
                <td><div className="bo-acciones">
                  <button type="button" className="btn-mini" onClick={() => setAjustando(p)}>± Stock</button>
                  <button type="button" className="btn-mini" onClick={() => setEditando(p)}>Editar</button>
                  <button type="button" className="btn-mini btn-mini-peligro" onClick={() => eliminar(p)}>Eliminar</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editando && (
        <FormProducto
          producto={editando === 'nuevo' ? null : editando}
          categorias={categorias}
          onCerrar={() => setEditando(null)}
          onGuardado={(p, nuevo) => {
            setProductos((prev) => (nuevo ? [...prev, p] : prev.map((x) => (x.id === p.id ? p : x))));
            setEditando(null);
            showToast(nuevo ? 'Producto creado' : 'Producto actualizado');
          }}
        />
      )}
      {ajustando && (
        <FormStock
          producto={ajustando}
          onCerrar={() => setAjustando(null)}
          onGuardado={(p) => {
            setProductos((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...p } : x)));
            setAjustando(null);
            showToast('Movimiento de inventario registrado');
          }}
        />
      )}
    </div>
  );
}

function FormProducto({ producto, categorias, onCerrar, onGuardado }) {
  const [f, setF] = useState(
    producto
      ? { nombre: producto.nombre, descripcion: producto.descripcion ?? '', precio: String(producto.precio), stock: String(producto.stock), categoriaId: producto.categoria?.id ?? '', imagenUrl: producto.imagenUrl ?? '' }
      : { ...VACIO, categoriaId: categorias[0]?.id ?? '' }
  );
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    const precio = Number(f.precio);
    const stock = Number(f.stock);
    if (!f.nombre.trim()) return setError('Escribe el nombre del producto.');
    if (!(precio >= 0) || f.precio === '') return setError('El precio debe ser un número mayor o igual a 0.');
    if (!Number.isInteger(stock) || stock < 0 || f.stock === '') return setError('El stock debe ser un entero mayor o igual a 0.');
    if (!f.categoriaId) return setError('Elige una categoría.');
    const input = {
      nombre: f.nombre.trim(), descripcion: f.descripcion.trim() || null, precio, stock,
      categoriaId: f.categoriaId, imagenUrl: f.imagenUrl.trim() || null,
    };
    setGuardando(true);
    try {
      if (producto) {
        const d = await gql(`mutation($id: ID!, $i: ProductoUpdateInput!) { actualizarProducto(id: $id, input: $i) { ${CAMPOS} } }`, { id: producto.id, i: input });
        onGuardado(d.actualizarProducto, false);
      } else {
        const d = await gql(`mutation($i: ProductoInput!) { crearProducto(input: $i) { ${CAMPOS} } }`, { i: input });
        onGuardado(d.crearProducto, true);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal titulo={producto ? `Editar: ${producto.nombre}` : 'Nuevo producto'} onCerrar={onCerrar}>
      <form className="bo-form" onSubmit={guardar}>
        <label className="bo-campo bo-campo-full">Nombre<input value={f.nombre} onChange={set('nombre')} placeholder="Proteína Whey 2kg" autoFocus /></label>
        <label className="bo-campo bo-campo-full">Descripción<textarea rows={3} value={f.descripcion} onChange={set('descripcion')} /></label>
        <label className="bo-campo">Precio (MXN)<input type="number" min="0" step="0.01" value={f.precio} onChange={set('precio')} /></label>
        <label className="bo-campo">Stock{producto && <small> (el cambio queda en el kardex como ajuste)</small>}<input type="number" min="0" step="1" value={f.stock} onChange={set('stock')} /></label>
        <label className="bo-campo">Categoría
          <select value={f.categoriaId} onChange={set('categoriaId')}>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>)}
          </select>
        </label>
        <label className="bo-campo">Imagen<input value={f.imagenUrl} onChange={set('imagenUrl')} placeholder="proteina.jpg o https://…" /></label>
        {error && <p className="auth-error bo-campo-full">{error}</p>}
        <div className="bo-form-acciones bo-campo-full">
          <button type="button" className="btn btn-secondary" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  );
}

function FormStock({ producto, onCerrar, onGuardado }) {
  const [tipo, setTipo] = useState('entrada');
  const [cantidad, setCantidad] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const n = Number(cantidad);
  const delta = tipo === 'entrada' ? Math.abs(n) : tipo === 'salida' ? -Math.abs(n) : n;
  const resultado = producto.stock + (Number.isFinite(delta) ? delta : 0);

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    if (!Number.isInteger(n) || n === 0) return setError('Escribe una cantidad entera distinta de 0.');
    if (!motivo.trim()) return setError('Escribe el motivo (por ejemplo: "Compra a proveedor", "Producto dañado").');
    setGuardando(true);
    try {
      const d = await gql(
        'mutation($id: ID!, $c: Int!, $t: String!, $m: String!) { ajustarStock(productoId: $id, cantidad: $c, tipo: $t, motivo: $m) { id stock } }',
        { id: producto.id, c: n, t: tipo, m: motivo.trim() }
      );
      onGuardado(d.ajustarStock);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal titulo={`Movimiento de inventario: ${producto.nombre}`} onCerrar={onCerrar}>
      <form className="bo-form" onSubmit={guardar}>
        <label className="bo-campo">Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="entrada">Entrada (llegó mercancía)</option>
            <option value="salida">Salida (merma, daño, uso interno)</option>
            <option value="ajuste">Ajuste (corrección de conteo, ±)</option>
          </select>
        </label>
        <label className="bo-campo">Cantidad<input type="number" step="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder={tipo === 'ajuste' ? 'Ej. -3 o 5' : 'Ej. 10'} autoFocus /></label>
        <label className="bo-campo bo-campo-full">Motivo<input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Compra a proveedor, conteo físico…" /></label>
        <p className="bo-campo-full bo-preview">Stock actual: <strong>{producto.stock}</strong> → quedará en <strong className={resultado < 0 ? 'texto-error' : ''}>{resultado}</strong></p>
        {error && <p className="auth-error bo-campo-full">{error}</p>}
        <div className="bo-form-acciones bo-campo-full">
          <button type="button" className="btn btn-secondary" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Registrar movimiento'}</button>
        </div>
      </form>
    </Modal>
  );
}
