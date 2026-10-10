// server.js — Servidor GraphQL independiente (FitStock backend).
// Corre en su propio puerto, separado por completo del frontend de Astro.
// El frontend (u otro cliente cualquiera) le habla por HTTP, nunca tocando
// la base de datos directamente.
import { createServer } from 'node:http';
import { createSchema, createYoga } from 'graphql-yoga';
import './src/db.js'; // dispara la inicialización de la base de datos
import { typeDefs } from './src/schema.js';
import { resolvers } from './src/resolvers.js';
import { usuarioPorToken } from './src/auth.js';
import { liberarPedidosAbandonados } from './src/pedidos.js';
import { modoDePasarela } from './src/pagos.js';

const PORT = process.env.PORT || 4000;
const schema = createSchema({ typeDefs, resolvers });

const yoga = createYoga({
  schema,
  graphqlEndpoint: '/graphql',
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  },
  // El frontend manda el token de sesión como "Authorization: Bearer <token>".
  // Este backend lo verifica contra su propia base de datos y arma el
  // contexto: nadie puede hacerse pasar por un usuario solo por decirlo.
  context: async ({ request }) => {
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim() || null;
    const user = await usuarioPorToken(token);
    return { user, token };
  },
});

const server = createServer(yoga);
server.listen(PORT, () => {
  console.log(`🚀 FitStock GraphQL API (backend independiente) en http://localhost:${PORT}/graphql`);
  console.log(`💳 PayPal: ${modoDePasarela('paypal')} · Mercado Pago: ${modoDePasarela('mercadopago')}  (simulado = sin credenciales en el entorno)`);
});

// Pedidos de PayPal / Mercado Pago que nadie pagó: se cancelan y el stock se libera.
const cadaMinutos = 5;
liberarPedidosAbandonados().catch((e) => console.error('liberarPedidosAbandonados:', e.message));
setInterval(
  () => liberarPedidosAbandonados().catch((e) => console.error('liberarPedidosAbandonados:', e.message)),
  cadaMinutos * 60 * 1000
).unref();
