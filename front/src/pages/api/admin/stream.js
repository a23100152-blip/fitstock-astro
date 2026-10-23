// GET /api/admin/stream?query=subscription{...} — Puente de GraphQL Subscriptions.
//
// El navegador abre un EventSource contra ESTE endpoint (mismo origen, la cookie de
// sesión viaja sola). Astro reenvía la suscripción al backend GraphQL con el token como
// "Authorization: Bearer" y devuelve el flujo SSE (text/event-stream) tal cual.
// El middleware ya exige rol admin para /api/admin/*, y el backend lo vuelve a validar.
import { BACKEND_URL, COOKIE } from '../../../lib/backend.js';

export const prerender = false;

export async function GET({ url, cookies, request }) {
  const query = url.searchParams.get('query') ?? '';
  // Solo se permiten operaciones de suscripción por este canal.
  if (!/^\s*subscription\b/.test(query)) {
    return new Response('Solo se aceptan suscripciones GraphQL.', { status: 400 });
  }

  const token = cookies.get(COOKIE)?.value;
  const destino = new URL('/graphql', BACKEND_URL);
  destino.searchParams.set('query', query);

  let res;
  try {
    res = await fetch(destino, {
      headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token ?? ''}` },
      signal: request.signal, // si el admin cierra la pestaña, se corta también la conexión con el backend
    });
  } catch {
    return new Response('No se pudo conectar con el backend.', { status: 502 });
  }

  return new Response(res.body, {
    status: res.status,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
