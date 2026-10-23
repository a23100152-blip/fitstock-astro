// api.js — Utilidades del BackOffice: consultas GraphQL y suscripciones en tiempo real.
import { useEffect, useRef, useState } from 'react';
import { graphqlRequest } from '../../api/client.js';

export { graphqlRequest as gql };

// Abre una GraphQL Subscription por SSE (EventSource) a través de /api/admin/stream.
// - onDato(data): se llama con `data` de cada evento "next".
// - onEstado('conectado' | 'reconectando'): para el indicador "En vivo".
// EventSource se reconecta solo si se cae la conexión; al reconectar se avisa con
// 'conectado' para que la pantalla vuelva a pedir los datos y no se pierda nada.
// Devuelve una función para cerrar la suscripción.
export function suscribir(query, onDato, onEstado = () => {}) {
  const es = new EventSource(`/api/admin/stream?query=${encodeURIComponent(query)}`);
  const recibir = (ev) => {
    if (!ev.data) return;
    try {
      const json = JSON.parse(ev.data);
      if (json.data) onDato(json.data);
    } catch {
      /* ping o fragmento sin JSON */
    }
  };
  es.addEventListener('next', recibir); // protocolo GraphQL over SSE (graphql-yoga)
  es.addEventListener('message', recibir); // por si llega sin nombre de evento
  es.addEventListener('open', () => onEstado('conectado'));
  es.addEventListener('error', () => onEstado('reconectando'));
  es.addEventListener('complete', () => es.close());
  return () => es.close();
}

// Hook de React: suscribe mientras el componente esté montado.
export function useSuscripcion(query, onDato) {
  const [estado, setEstado] = useState('conectando');
  const cb = useRef(onDato);
  cb.current = onDato;
  useEffect(() => suscribir(query, (d) => cb.current(d), setEstado), [query]);
  return estado;
}

export const SUB_EVENTO = /* GraphQL */ `subscription { eventoBackoffice { id accion entidad entidadId mensaje usuario fecha } }`;
export const SUB_STOCK = /* GraphQL */ `subscription { stockActualizado { id nombre stock precio } }`;
export const SUB_PEDIDO = /* GraphQL */ `subscription {
  pedidoActualizado { id nombreContacto emailContacto metodoPago total estado estadoPago fechaCreacion }
}`;

export const mxn = (n) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(n ?? 0);

// "2026-10-22 18:03:11" (UTC de SQLite) → "22/10/26 12:03" en hora local
export const fechaHora = (sql) => {
  if (!sql) return '';
  const d = new Date(sql.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return sql;
  return d.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};

// Indicador visual del estado de la conexión en vivo.
export function EnVivo({ estado }) {
  const ok = estado === 'conectado';
  return (
    <span className={`envivo ${ok ? 'envivo-ok' : 'envivo-off'}`} title="GraphQL Subscription por SSE">
      <span className="envivo-punto" /> {ok ? 'En vivo' : estado === 'conectando' ? 'Conectando…' : 'Reconectando…'}
    </span>
  );
}
