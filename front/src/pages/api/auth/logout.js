import { backendGraphQL, COOKIE } from '../../../lib/backend.js';

export const prerender = false;

export async function POST({ cookies, redirect }) {
  const token = cookies.get(COOKIE)?.value;
  if (token) {
    try {
      await backendGraphQL('mutation { cerrarSesion }', {}, token);
    } catch {
      // Si el backend no responde, igual borramos la cookie local.
    }
  }
  cookies.delete(COOKIE, { path: '/' });
  return redirect('/');
}
