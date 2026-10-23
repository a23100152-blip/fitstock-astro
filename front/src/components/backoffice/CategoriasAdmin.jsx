// CategoriasAdmin.jsx — Módulo de categorías del BackOffice.
// Alta, edición y baja (solo si la categoría no tiene productos).
import { useState } from 'react';
import { gql, useSuscripcion, SUB_EVENTO, EnVivo } from './api.jsx';
import { useToast } from '../../store/useToastStore.js';
import Modal from './Modal.jsx';

const Q_CATS = '{ categorias { id nombre descripcion icono productos { id stock } } }';

export default function CategoriasAdmin({ inicial = [] }) {
  const [cats, setCats] = useState(inicial);
  const [editando, setEditando] = useState(null); // null | 'nueva' | categoria
  const { showToast } = useToast();

  const cargar = async () => {
    try {
      setCats((await gql(Q_CATS)).categorias);
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  // Si otro administrador cambia categorías o productos, la lista se refresca sola.
  const estado = useSuscripcion(SUB_EVENTO, ({ eventoBackoffice: ev }) => {
    if (ev.entidad === 'categoria' || ev.entidad === 'producto') cargar();
  });

  const eliminar = async (c) => {
    if (!confirm(`¿Eliminar la categoría "${c.nombre}"?`)) return;
    try {
      await gql('mutation($id: ID!) { eliminarCategoria(id: $id) }', { id: c.id });
      setCats((prev) => prev.filter((x) => x.id !== c.id));
      showToast('Categoría eliminada');
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  return (
    <div className="dash-card">
      <div className="bo-toolbar">
        <p className="bo-contador" style={{ margin: 0 }}>{cats.length} categorías</p>
        <EnVivo estado={estado} />
        <button type="button" className="btn btn-primary bo-derecha" onClick={() => setEditando('nueva')}>+ Nueva categoría</button>
      </div>
      <div className="cat-grid">
        {cats.map((c) => {
          const unidades = c.productos.reduce((s, p) => s + p.stock, 0);
          return (
            <article key={c.id} className="cat-card">
              <div className="cat-icono">{c.icono || '🗂️'}</div>
              <h4>{c.nombre}</h4>
              <p className="cat-desc">{c.descripcion || 'Sin descripción'}</p>
              <p className="cat-meta">{c.productos.length} producto(s) · {unidades} unidades en stock</p>
              <div className="bo-acciones">
                <a className="btn-mini" href={`/categoria/${c.id}`} target="_blank" rel="noreferrer">Ver en tienda</a>
                <button type="button" className="btn-mini" onClick={() => setEditando(c)}>Editar</button>
                <button type="button" className="btn-mini btn-mini-peligro" onClick={() => eliminar(c)} disabled={c.productos.length > 0} title={c.productos.length > 0 ? 'Mueve sus productos antes de eliminarla' : ''}>Eliminar</button>
              </div>
            </article>
          );
        })}
      </div>

      {editando && (
        <FormCategoria
          categoria={editando === 'nueva' ? null : editando}
          onCerrar={() => setEditando(null)}
          onGuardado={(c, nueva) => {
            setCats((prev) => (nueva ? [...prev, { ...c, productos: [] }] : prev.map((x) => (x.id === c.id ? { ...x, ...c } : x))));
            setEditando(null);
            showToast(nueva ? 'Categoría creada' : 'Categoría actualizada');
          }}
        />
      )}
    </div>
  );
}

function FormCategoria({ categoria, onCerrar, onGuardado }) {
  const [f, setF] = useState({
    nombre: categoria?.nombre ?? '', descripcion: categoria?.descripcion ?? '', icono: categoria?.icono ?? '',
  });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    if (!f.nombre.trim()) return setError('Escribe el nombre de la categoría.');
    const input = { nombre: f.nombre.trim(), descripcion: f.descripcion.trim() || null, icono: f.icono.trim() || null };
    try {
      if (categoria) {
        const d = await gql('mutation($id: ID!, $i: CategoriaInput!) { actualizarCategoria(id: $id, input: $i) { id nombre descripcion icono } }', { id: categoria.id, i: input });
        onGuardado(d.actualizarCategoria, false);
      } else {
        const d = await gql('mutation($i: CategoriaInput!) { crearCategoria(input: $i) { id nombre descripcion icono } }', { i: input });
        onGuardado(d.crearCategoria, true);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Modal titulo={categoria ? `Editar: ${categoria.nombre}` : 'Nueva categoría'} onCerrar={onCerrar}>
      <form className="bo-form" onSubmit={guardar}>
        <label className="bo-campo">Nombre<input value={f.nombre} onChange={set('nombre')} placeholder="Snacks fit" autoFocus /></label>
        <label className="bo-campo">Ícono (emoji)<input value={f.icono} onChange={set('icono')} placeholder="🍫" maxLength={4} /></label>
        <label className="bo-campo bo-campo-full">Descripción<input value={f.descripcion} onChange={set('descripcion')} placeholder="Barras de proteína y snacks saludables" /></label>
        {error && <p className="auth-error bo-campo-full">{error}</p>}
        <div className="bo-form-acciones bo-campo-full">
          <button type="button" className="btn btn-secondary" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn btn-primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}
