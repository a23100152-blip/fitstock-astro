// POST /api/cuenta/nombre — Edita el nombre del usuario con sesión.
// Es un proxy: valida que haya sesión y reenvía el cambio al backend,
// que es quien de verdad valida y escribe en la base de datos.
import { backendGraphQL, COOKIE } from '../../../lib/backend.js';

export const prerender = false;

const MUTATION = `mutation($nombre: String!) { actualizarNombre(nombre: $nombre) { id } }`;

export async function POST({ request, locals, cookies, redirect }) {
  if (!locals.user) return redirect('/login?next=/cuenta');

  const form = await request.formData();
  const nombre = String(form.get('nombre') ?? '');
  const token = cookies.get(COOKIE)?.value;

  try {
    await backendGraphQL(MUTATION, { nombre }, token);
    return redirect('/cuenta?ok=nombre');
  } catch (err) {
    return redirect(`/cuenta?${new URLSearchParams({ error: err.message })}`);
  }
}
