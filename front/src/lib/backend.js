// backend.js — Único punto de contacto de Astro con el backend.
// Astro YA NO toca la base de datos ni ejecuta resolvers en proceso: todo
// pasa por una petición HTTP real a BACKEND_URL (el servidor GraphQL
// independiente en back/). Esto es justo lo que separa "frontend" de
// "backend": si este archivo desapareciera, Astro se quedaría sin forma de
// leer o escribir ningún dato.
const BACKEND_URL = import.meta.env.BACKEND_URL || 'http://localhost:4000';

export async function backendGraphQL(query, variables = {}, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BACKEND_URL}/graphql`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new Error(
      `No se pudo conectar con el backend en ${BACKEND_URL}. ` +
        `¿Está corriendo? (cd back && npm run dev)`
    );
  }

  const json = await res.json();
  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors[0].message);
  }
  return json.data;
}

// ---- Cookie de sesión (esto SÍ es responsabilidad del frontend: es quien
// le habla al navegador por HTTP) ----
export const COOKIE = 'fs_session';
export const SESION_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

export const cookieOpts = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
  secure: import.meta.env.PROD,
  maxAge: SESION_MS / 1000,
};

// Evita open-redirect: solo se aceptan rutas internas como destino "next".
export function rutaSegura(next) {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}
