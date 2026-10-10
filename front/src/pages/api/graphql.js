// /api/graphql — Proxy hacia el backend GraphQL independiente.
// Las islas de React en el navegador le siguen hablando a este mismo
// origen (así la cookie de sesión viaja sola, sin problemas de CORS), pero
// Astro ya NO ejecuta resolvers aquí: solo reenvía la petición al backend
// real, mandando el token de sesión como Authorization: Bearer <token>.
import { backendGraphQL, COOKIE } from '../../lib/backend.js';

export const prerender = false;

export const POST = async ({ request, cookies }) => {
  const token = cookies.get(COOKIE)?.value ?? null;
  const { query, variables } = await request.json();

  try {
    const data = await backendGraphQL(query, variables, token);
    return new Response(JSON.stringify({ data }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ errors: [{ message: err.message }] }), {
      status: 200, // el cliente GraphQL de las islas espera 200 + errors[]
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
