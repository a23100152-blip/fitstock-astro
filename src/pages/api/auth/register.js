import {
  validarRegistro, registrarUsuario, crearSesion, COOKIE, cookieOpts, rutaSegura,
} from '../../../server/auth.js';

export const prerender = false;

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

  const errorValidacion = validarRegistro(datos);
  if (errorValidacion) return volver(errorValidacion);

  const res = await registrarUsuario(datos);
  if (res.error) return volver(res.error);

  cookies.set(COOKIE, await crearSesion(res.id), cookieOpts);
  return redirect(next);
}
