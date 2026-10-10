// middleware.js — Corre en CADA petición antes de renderizar la página.
// 1) Manda la cookie de sesión al backend para saber quién es el usuario
//    (ya no se consulta la base de datos directamente desde aquí).
// 2) Protege rutas privadas redirigiendo a /login.
// 3) Restringe /admin al rol admin.
// 4) Evita que un usuario con sesión vea /login o /registro.
import { defineMiddleware } from 'astro:middleware';
import { COOKIE, backendGraphQL } from './lib/backend.js';

const RUTAS_PRIVADAS = ['/checkout', '/cuenta', '/pedidos', '/api/cuenta', '/pago', '/admin', '/api/admin'];
// Solo el rol "admin" entra aquí (el backend vuelve a validarlo en cada consulta).
const RUTAS_ADMIN = ['/admin', '/api/admin'];
const RUTAS_SOLO_INVITADO = ['/login', '/registro'];

const coincide = (path, base) => path === base || path.startsWith(base + '/');

export const onRequest = defineMiddleware(async (context, next) => {
  const token = context.cookies.get(COOKIE)?.value ?? null;
  context.locals.user = null;
  context.locals.token = token;

  if (token) {
    try {
      const data = await backendGraphQL('{ yo { id nombre email rol } }', {}, token);
      context.locals.user = data.yo;
    } catch {
      context.locals.user = null;
    }
  }

  const { pathname, search } = context.url;

  if (!context.locals.user && RUTAS_PRIVADAS.some((r) => coincide(pathname, r))) {
    return context.redirect(`/login?next=${encodeURIComponent(pathname + search)}`);
  }
  if (context.locals.user && context.locals.user.rol !== 'admin' && RUTAS_ADMIN.some((r) => coincide(pathname, r))) {
    return context.redirect('/');
  }
  if (context.locals.user && RUTAS_SOLO_INVITADO.includes(pathname)) {
    return context.redirect('/');
  }
  return next();
});
