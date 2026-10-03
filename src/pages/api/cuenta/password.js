// POST /api/cuenta/password — Cambia la contraseña del usuario con sesión.
// Exige la contraseña actual (prueba de que es el dueño y no alguien con la sesión abierta)
// y, si todo sale bien, cierra las demás sesiones de esta cuenta.
import { cambiarPassword, COOKIE } from '../../../server/auth.js';

export const prerender = false;

export async function POST({ request, cookies, locals, redirect }) {
  if (!locals.user) return redirect('/login?next=/cuenta');

  const form = await request.formData();
  const datos = {
    actual: String(form.get('actual') ?? ''),
    nueva: String(form.get('nueva') ?? ''),
    confirm: String(form.get('confirm') ?? ''),
  };

  const tokenActual = cookies.get(COOKIE)?.value;
  const error = await cambiarPassword(locals.user.id, tokenActual, datos);
  if (error) return redirect(`/cuenta?${new URLSearchParams({ error })}`);

  return redirect('/cuenta?ok=password');
}
