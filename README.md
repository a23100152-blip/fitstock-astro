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

### Mercado Pago con interfaz propia (Checkout API + Secure Fields)
Mercado Pago ofrece dos formas de integrarse: **Checkout Pro** (te redirige a su pantalla de pago ya diseñada) y
**Checkout API** (tú diseñas el formulario). Este proyecto usa **Checkout API**: el cliente nunca sale de FitStock.

1. El formulario de tarjeta (`front/src/components/checkout/MercadoPagoForm.jsx`) es de FitStock: nombre del titular,
   número, vencimiento, CVV y selector de pagos/cuotas, con nuestros colores y validaciones.
2. Número, vencimiento y CVV son *Secure Fields* de MercadoPago.js (iframes con nuestro estilo): por seguridad PCI esos
   datos nunca pasan por nuestro código. Al continuar se obtiene un **token** de un solo uso.
3. Al confirmar, se crea el pedido `pendiente` (stock reservado) y el front manda **solo el token** a la mutation
   `pagarConTarjetaMP`. El backend hace `POST /v1/payments` con el monto **tomado de la base de datos** (nunca del navegador).
4. Aprobado → `pagado` y se vacía el carrito. Rechazado → el pedido sigue reservado y el cliente prueba otra tarjeta.
   Un pedido sin pagar por más de 30 min se cancela solo (stock devuelto).

### Pagar con PayPal (redirección)
Al confirmar, el backend crea la orden y el cliente es redirigido a PayPal; al volver a `/pago/retorno` el backend
**consulta a PayPal** y solo entonces marca `pagado`.

**Modo simulado (por defecto):** sin credenciales, PayPal usa una pantalla de demostración (`/pago/simulado`) y el formulario de
Mercado Pago usa campos normales (tarjeta de 16 dígitos; si termina en `0000` simula un rechazo).

**Modo real (sandbox) de Mercado Pago:** en `back/.env` pon `MP_ACCESS_TOKEN` (Access Token de prueba, secreto) y en
`front/.env` pon `PUBLIC_MP_PUBLIC_KEY` (Public Key de prueba, `TEST-...`). Reinicia ambos. Paga con las
[tarjetas de prueba de Mercado Pago](https://www.mercadopago.com.mx/developers/es/docs/checkout-api-payments/additional-content/your-integrations/test/cards).
Para PayPal: `PAYPAL_CLIENT_ID` y `PAYPAL_CLIENT_SECRET`.

### Dashboard de administrador
Entra con `admin@fitstock.com` / `Admin1234` y abre **📊 Panel admin** (o `/admin`). Muestra ingresos, pedidos,
ticket promedio, ventas por día, ingresos por método de pago, ventas por categoría, productos más vendidos,
pedidos por estado, inventario bajo y los pedidos recientes (el admin puede cambiar el estado de pago y de envío).
Solo cuentan como venta los pedidos **pagados** y no cancelados.

Para tener datos de ejemplo: `cd back && npm run seed:demo` (crea ~50 pedidos de los últimos 45 días; es repetible).
`npm run db:reset` deja la base limpia.
