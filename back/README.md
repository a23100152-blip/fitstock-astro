# FitStock — Backend (GraphQL)

Servidor GraphQL independiente (Node + graphql-yoga + libSQL/SQLite). Único
componente que accede a la base de datos.

```bash
npm install
npm run dev        # http://localhost:4000/graphql
npm run seed:demo  # (opcional) ventas de ejemplo para el dashboard de admin
```

- Primer arranque: crea `data/fitstock.sqlite` desde `db.sql` (catálogo + usuarios demo).
  Si la base ya existía de la práctica anterior, se **migra sola** (tabla `pedido` con `estado_pago`, `referencia_pago` y el método `mercadopago`).
- Reiniciar datos: `npm run db:reset` y volver a arrancar.
- Variables (ver `.env.example`): `PORT`, `CORS_ORIGIN`, `FRONT_URL`, `PAYPAL_*`, `MP_ACCESS_TOKEN`, `TURSO_*`.
- Autenticación: el cliente manda `Authorization: Bearer <token>`; el backend valida el token contra la tabla `sesion`.
- Cobros: `src/pagos.js` (PayPal Orders v2 y Mercado Pago Checkout Pro). Dashboard: `src/estadisticas.js`.
