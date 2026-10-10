// POST /api/admin/pedido — El admin cambia el estado de envío y/o el estado de pago de un pedido
// desde la tabla del dashboard. El middleware ya exige sesión de admin y el backend la vuelve a validar.
import { backendGraphQL, COOKIE, rutaSegura } from '../../../lib/backend.js';

export const prerender = false;

export async function POST({ request, cookies, redirect }) {
  const token = cookies.get(COOKIE)?.value;
  const form = await request.formData();
  const id = String(form.get('id') ?? '');
  const estado = form.get('estado');
  const estadoPago = form.get('estadoPago');
  const volver = rutaSegura(String(form.get('volver') ?? '/admin'));

  const conMensaje = (clave, texto) => {
    const url = new URL(volver, 'http://x');
    url.searchParams.set(clave, texto);
    return redirect(`${url.pathname}${url.search}#pedidos`);
  };

  try {
    if (estado) {
      await backendGraphQL(
        'mutation($id: ID!, $e: String!) { actualizarEstadoPedido(id: $id, estado: $e) { id } }',
        { id, e: String(estado) },
        token
      );
    }
    if (estadoPago) {
      await backendGraphQL(
        'mutation($id: ID!, $e: String!) { actualizarEstadoPago(id: $id, estadoPago: $e) { id } }',
        { id, e: String(estadoPago) },
        token
      );
    }
    return conMensaje('ok', `Pedido #${id} actualizado.`);
  } catch (err) {
    return conMensaje('error', err.message);
  }
}
