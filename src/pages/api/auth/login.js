import {
  autenticar, crearSesion, COOKIE, cookieOpts, rutaSegura,
  minutosDeBloqueo, registrarIntentoFallido, limpiarIntentos,
} from '../../../server/auth.js';

export const prerender = false;

export async function POST({ request, cookies, redirect }) {
  const form = await request.formData();
  const email = String(form.get('email') ?? '');
  const password = String(form.get('password') ?? '');
  const next = rutaSegura(String(form.get('next') ?? '/'));

  const volver = (error) => redirect(`/login?${new URLSearchParams({ error, next })}`);

  // 1) ¿Ese correo ya agotó sus intentos? Se revisa ANTES de mirar la contraseña,
  //    así, mientras esté bloqueado, ni la contraseña correcta entra.
  const minutos = await minutosDeBloqueo(email);
  if (minutos > 0) {
    return volver(`Demasiados intentos fallidos. Intenta de nuevo en ${minutos} minuto${minutos === 1 ? '' : 's'}.`);
  }

  // 2) Verificar credenciales.
  const usuarioId = await autenticar(email, password);
  if (!usuarioId) {
    await registrarIntentoFallido(email);
    return volver('Correo o contraseña incorrectos.');
  }

  // 3) Éxito: se borran los fallos acumulados y se crea la sesión.
  await limpiarIntentos(email);
  cookies.set(COOKIE, await crearSesion(usuarioId), cookieOpts);
  return redirect(next);
}
