// middleware.js — Corre en CADA petición antes de renderizar la página.
// 1) Lee la cookie de sesión y pone al usuario en Astro.locals.user
// 2) Protege rutas privadas redirigiendo a /login?next=...
// 3) Evita que un usuario con sesión vea /login o /registro
import { defineMiddleware } from 'astro:middleware';
import { COOKIE, usuarioPorToken } from './server/auth.js';

const RUTAS_PRIVADAS = ['/checkout', '/cuenta', '/pedidos', '/api/cuenta'];
const RUTAS_SOLO_INVITADO = ['/login', '/registro'];

const coincide = (path, base) => path === base || path.startsWith(base + '/');

export const onRequest = defineMiddleware(async (context, next) => {
  const token = context.cookies.get(COOKIE)?.value;
  context.locals.user = await usuarioPorToken(token);

  const { pathname, search } = context.url;

  if (!context.locals.user && RUTAS_PRIVADAS.some((r) => coincide(pathname, r))) {
    return context.redirect(`/login?next=${encodeURIComponent(pathname + search)}`);
  }
  if (context.locals.user && RUTAS_SOLO_INVITADO.includes(pathname)) {
    return context.redirect('/');
  }
  return next();
});
