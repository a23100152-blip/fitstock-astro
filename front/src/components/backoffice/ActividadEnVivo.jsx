// ActividadEnVivo.jsx — Bitácora de auditoría en tiempo real.
// Escucha la suscripción `eventoBackoffice`: cada alta, cambio, pedido o pago
// aparece arriba de la lista al instante, sin recargar la página.
import { useEffect, useState } from 'react';
import { gql, useSuscripcion, SUB_EVENTO, EnVivo, fechaHora } from './api.jsx';
import { useToast } from '../../store/useToastStore.js';

const ICONO = { producto: '📦', categoria: '🗂️', usuario: '👤', pedido: '🧾', inventario: '🏷️' };
const FILTROS = [
  ['', 'Todo'], ['pedido', 'Pedidos'], ['producto', 'Productos'], ['inventario', 'Inventario'],
  ['categoria', 'Categorías'], ['usuario', 'Usuarios'],
];

export default function ActividadEnVivo({ inicial = [], compacto = false, limite = 50 }) {
  const [eventos, setEventos] = useState(inicial);
  const [nuevos, setNuevos] = useState(() => new Set());
  const [filtro, setFiltro] = useState('');
  const { showToast } = useToast();

  const recargar = async () => {
    try {
      const d = await gql(`query($l: Int) { bitacora(limite: $l) { id accion entidad entidadId mensaje usuario fecha } }`, { l: limite });
      setEventos(d.bitacora);
    } catch {
      /* se intenta de nuevo en la siguiente reconexión */
    }
  };

  const estado = useSuscripcion(SUB_EVENTO, ({ eventoBackoffice: ev }) => {
    setEventos((prev) => [ev, ...prev.filter((e) => e.id !== ev.id)].slice(0, limite));
    setNuevos((prev) => new Set(prev).add(ev.id));
    setTimeout(() => setNuevos((prev) => { const s = new Set(prev); s.delete(ev.id); return s; }), 4000);
    if (!compacto && ev.entidad === 'pedido' && ev.accion === 'pedido') showToast(`🧾 ${ev.mensaje}`);
  });

  // Al (re)conectar se vuelve a pedir la bitácora: si la conexión se cortó, no se pierde nada.
  useEffect(() => {
    if (estado === 'conectado') recargar();
  }, [estado]);

  const visibles = filtro ? eventos.filter((e) => e.entidad === filtro) : eventos;

  return (
    <div className="actividad">
      <div className="actividad-head">
        <EnVivo estado={estado} />
        {!compacto && (
          <div className="chips">
            {FILTROS.map(([v, t]) => (
              <button key={v} type="button" className={`chip ${filtro === v ? 'chip-activo' : ''}`} onClick={() => setFiltro(v)}>{t}</button>
            ))}
          </div>
        )}
      </div>
      {visibles.length === 0 ? (
        <p className="dash-vacio">Aún no hay actividad registrada. Las acciones del BackOffice y de la tienda aparecerán aquí al instante.</p>
      ) : (
        <ul className={`actividad-lista ${compacto ? 'actividad-compacta' : ''}`}>
          {visibles.slice(0, compacto ? 8 : limite).map((e) => (
            <li key={e.id} className={nuevos.has(e.id) ? 'fila-nueva' : ''}>
              <span className="actividad-icono">{ICONO[e.entidad] ?? '•'}</span>
              <div className="actividad-texto">
                <p>{e.mensaje}</p>
                <small>{e.usuario ?? 'Sistema'} · {fechaHora(e.fecha)}</small>
              </div>
              <span className={`tag tag-${e.accion}`}>{e.accion}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
