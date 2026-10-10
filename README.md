# FitStock — PP1 + Auth System migrado a Astro

Proyecto separado en dos partes independientes:

- **`back/`** — servidor GraphQL (Node + graphql-yoga + libSQL/SQLite). Es el
  único lugar que toca la base de datos.
- **`front/`** — sitio en Astro (con islas de React para lo interactivo).
  Le habla a `back/` únicamente por HTTP (`fetch` a `/graphql`), nunca toca
  la base de datos directamente.

## Cómo correrlo localmente (dos terminales)

**Terminal 1 — backend:**
```bash
cd back
npm install
npm run dev
```
Debe quedar escuchando en `http://localhost:4000/graphql`.
La primera vez que arranca crea la base de datos (`back/data/fitstock.sqlite`)
con el esquema de `db.sql` y dos cuentas de prueba:
- Cliente: `demo@fitstock.com` / `Demo1234`
- Admin: `admin@fitstock.com` / `Admin1234`

**Terminal 2 — frontend:**
```bash
cd front
npm install
npm run dev
```
Debe quedar escuchando en `http://localhost:4321`. El archivo `front/.env`
ya apunta a `BACKEND_URL=http://localhost:4000`.

Con ambos corriendo, abre `http://localhost:4321` en el navegador.

## Notas sobre la separación

- `front/` no importa nada de `back/` ni de ninguna librería de base de
  datos: todo el acceso a datos pasa por `front/src/lib/backend.js`, que
  hace peticiones HTTP reales a `BACKEND_URL`.
- La sesión viaja como una cookie httpOnly puesta por Astro
  (`front/src/pages/api/auth/*`), pero quien valida esa sesión en cada
  petición es el backend (`back/src/auth.js` + `back/server.js`), no Astro.

## Despliegue (si lo piden)

- `front/` → Netlify (`netlify.toml`), con la variable `BACKEND_URL`.
- `back/` → cualquier host Node (Render, Railway, Fly…) con `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`
  y `CORS_ORIGIN` con la URL del front.

---

## Métodos de cobro (PayPal + Mercado Pago) y Dashboard de administrador

### Pagar con PayPal / Mercado Pago
En el checkout (paso "Pago") ahora hay 4 métodos: tarjeta, **PayPal**, **Mercado Pago** y transferencia.

1. Al confirmar, se crea el pedido en estado de pago `pendiente` (el stock queda reservado).
2. El backend crea la orden (PayPal) o preferencia (Mercado Pago) y el cliente es redirigido a la pasarela.
3. Al volver a `/pago/retorno`, el backend **consulta a la pasarela** si el pago es real y coincide con el pedido y el monto. Solo entonces queda `pagado` y se vacía el carrito.
4. Si el cliente cancela, el pedido se cancela y el stock se devuelve. Un pedido sin pagar por más de 30 min se cancela solo.

**Modo simulado (por defecto):** sin credenciales, las dos pasarelas usan una pantalla de pago de demostración (`/pago/simulado`) para probar todo el flujo sin cuentas de desarrollador.

**Modo real (sandbox):** copia `back/.env.example` a `back/.env`, pon tus credenciales de prueba
(`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `MP_ACCESS_TOKEN`) y reinicia el backend. Al arrancar verás
`PayPal: real · Mercado Pago: real`. Para Mercado Pago paga con un *usuario comprador de prueba* y sus tarjetas de prueba.

### Dashboard de administrador
Entra con `admin@fitstock.com` / `Admin1234` y abre **📊 Panel admin** (o `/admin`). Muestra ingresos, pedidos,
ticket promedio, ventas por día, ingresos por método de pago, ventas por categoría, productos más vendidos,
pedidos por estado, inventario bajo y los pedidos recientes (el admin puede cambiar el estado de pago y de envío).
Solo cuentan como venta los pedidos **pagados** y no cancelados.

Para tener datos de ejemplo: `cd back && npm run seed:demo` (crea ~50 pedidos de los últimos 45 días; es repetible).
`npm run db:reset` deja la base limpia.
