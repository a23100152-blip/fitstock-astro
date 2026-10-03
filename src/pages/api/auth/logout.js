import { COOKIE, destruirSesion } from '../../../server/auth.js';

export const prerender = false;

export async function POST({ cookies, redirect }) {
  await destruirSesion(cookies.get(COOKIE)?.value);
  cookies.delete(COOKIE, { path: '/' });
  return redirect('/');
}
