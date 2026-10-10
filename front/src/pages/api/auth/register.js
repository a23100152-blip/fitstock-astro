import { backendGraphQL, COOKIE, cookieOpts, rutaSegura } from '../../../lib/backend.js';

export const prerender = false;

const MUTATION = `
  mutation($nombre: String!, $email: String!, $password: String!, $confirm: String!) {
    registrarUsuario(nombre: $nombre, email: $email, password: $password, confirm: $confirm) {
      token
    }
  }
`;

export async function POST({ request, cookies, redirect }) {
  const form = await request.formData();
  const datos = {
    nombre: String(form.get('nombre') ?? ''),
    email: String(form.get('email') ?? ''),
    password: String(form.get('password') ?? ''),
    confirm: String(form.get('confirm') ?? ''),
  };
  const next = rutaSegura(String(form.get('next') ?? '/'));

  const volver = (error) => {
    const qs = new URLSearchParams({ error, next, nombre: datos.nombre, email: datos.email });
    return redirect(`/registro?${qs}`);
  };

  try {
    const data = await backendGraphQL(MUTATION, datos);
    cookies.set(COOKIE, data.registrarUsuario.token, cookieOpts);
    return redirect(next);
  } catch (err) {
    return volver(err.message);
  }
}
