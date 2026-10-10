import { backendGraphQL, COOKIE, cookieOpts, rutaSegura } from '../../../lib/backend.js';

export const prerender = false;

const MUTATION = `
  mutation($email: String!, $password: String!) {
    iniciarSesion(email: $email, password: $password) {
      token
    }
  }
`;

export async function POST({ request, cookies, redirect }) {
  const form = await request.formData();
  const email = String(form.get('email') ?? '');
  const password = String(form.get('password') ?? '');
  const next = rutaSegura(String(form.get('next') ?? '/'));

  const volver = (error) => redirect(`/login?${new URLSearchParams({ error, next, email })}`);

  try {
    const data = await backendGraphQL(MUTATION, { email, password });
    cookies.set(COOKIE, data.iniciarSesion.token, cookieOpts);
    return redirect(next);
  } catch (err) {
    return volver(err.message);
  }
}
