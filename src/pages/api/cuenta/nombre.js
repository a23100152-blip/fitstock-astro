// POST /api/cuenta/nombre — Edita el nombre del usuario con sesión.
import { actualizarNombre, validarNombre } from '../../../server/auth.js';

export const prerender = false;

export async function POST({ request, locals, redirect }) {
  if (!locals.user) return redirect('/login?next=/cuenta');

  const form = await request.formData();
  const nombre = String(form.get('nombre') ?? '');

  const error = validarNombre(nombre);
  if (error) return redirect(`/cuenta?${new URLSearchParams({ error })}`);

  await actualizarNombre(locals.user.id, nombre);
  return redirect('/cuenta?ok=nombre');
}
