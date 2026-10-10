// POST /api/cuenta/password — Cambia la contraseña del usuario con sesión.
// Proxy hacia el backend: la validación de la contraseña actual, las reglas
// de la nueva contraseña y el cierre de las demás sesiones viven ahí.
import { backendGraphQL, COOKIE } from '../../../lib/backend.js';

export const prerender = false;

const MUTATION = `
  mutation($actual: String!, $nueva: String!, $confirm: String!) {
    cambiarPassword(actual: $actual, nueva: $nueva, confirm: $confirm)
  }
`;

export async function POST({ request, cookies, locals, redirect }) {
  if (!locals.user) return redirect('/login?next=/cuenta');

  const form = await request.formData();
  const datos = {
    actual: String(form.get('actual') ?? ''),
    nueva: String(form.get('nueva') ?? ''),
    confirm: String(form.get('confirm') ?? ''),
  };
  const token = cookies.get(COOKIE)?.value;

  try {
    await backendGraphQL(MUTATION, datos, token);
    return redirect('/cuenta?ok=password');
  } catch (err) {
    return redirect(`/cuenta?${new URLSearchParams({ error: err.message })}`);
  }
}
