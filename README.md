# FitStock — PP1 + Auth System migrado a Astro

Tienda de suplementos, ropa y accesorios (PP1) con sistema de autenticación,
migrada de **React + Vite + servidor GraphQL separado** a **Astro (SSR)** en un
solo proyecto y un solo proceso.

## Cómo correrlo

Requiere **Node 22+**. La BD es libSQL: en local usa `data/fitstock.sqlite` y en Netlify usa Turso (variables `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`).

```bash
npm install
npm run dev          # http://localhost:4321
```

Producción: se despliega en Netlify con `@astrojs/netlify` (ver `netlify.toml`).
Reiniciar datos: `npm run db:reset` (la BD se recrea al siguiente arranque).

### Cuentas de demostración

| Rol     | Correo               | Contraseña |
|---------|----------------------|------------|
| Cliente | demo@fitstock.com    | Demo1234   |
| Admin   | admin@fitstock.com   | Admin1234  |

## Qué cambió en la migración

| Antes (PP1)                                   | Ahora (Astro)                                              |
|-----------------------------------------------|------------------------------------------------------------|
| SPA de React, navegación con Zustand (`vista`)| Rutas por archivo: `/`, `/categoria/[id]`, `/checkout`…    |
| Backend aparte en `:4000` (Yoga)              | `src/pages/api/graphql.js` en el mismo proyecto            |
| Home/categorías/sidebar cargados con `useEffect` | Cargados en el **servidor** (`.astro`) y enviados como HTML |
| Todo el árbol era React                       | Layout y páginas en `.astro`; React solo en **islas**      |
| Imágenes importadas por Vite                  | Servidas desde `public/products/`                          |
| `ToastContext` (Context API)                  | `useToastStore` (Zustand): Context no cruza islas          |
| Carrito solo en memoria                       | Carrito con `persist` (localStorage): sobrevive entre páginas |
| BD se borraba en cada arranque                | BD persistente (hay usuarios y sesiones); semilla solo la 1ª vez |

### Islas de React (lo único que se hidrata)

- `CategoryDetail` (`client:load`): búsqueda, orden, agregar rápido, modal de producto.
- `CartWidget` (`client:only`): botón con contador + drawer del carrito.
- `Checkout` (`client:only`): flujo de 3 pasos + confirmación.
- `ToastHost` (`client:only`): notificaciones.

`client:only` se usa donde el estado vive en `localStorage` (no existe en el servidor).

## Auth System

- **Registro / login / logout** con formularios HTML normales → `src/pages/api/auth/*`.
- **Contraseñas**: `scrypt` con salt aleatorio y comparación en tiempo constante (`src/server/password.js`).
- **Sesiones**: token aleatorio en cookie `httpOnly` + `SameSite=Lax`; en la BD solo se guarda su SHA-256 (`src/server/auth.js`). Expiran a los 7 días.
- **Middleware** (`src/middleware.js`): pone `Astro.locals.user` en cada petición, protege `/checkout`, `/cuenta` y `/pedidos` (redirige a `/login?next=…`) y saca de `/login` a quien ya tiene sesión.
- **Autorización en GraphQL** (`src/server/resolvers.js`): `crearPedido` y `misPedidos` requieren sesión; `pedido(id)` solo para su dueño o admin; `pedidos`, `crearProducto`, `actualizarProducto`, `eliminarProducto` y `actualizarEstadoPedido` solo admin.
- **Límite de intentos de login** (`src/server/auth.js` + `api/auth/login.js`): 5 fallos por correo en 15 minutos bloquean el login (aunque la contraseña sea correcta) hasta que pase la ventana. Un login exitoso borra los fallos. Se cuenta por correo, exista o no la cuenta, para no revelar qué correos están registrados.
- **Limpieza de sesiones vencidas**: cada login/registro borra de la tabla `sesion` las filas con `expira_en` pasado.
- **Mi cuenta** (`/cuenta`): editar nombre y cambiar contraseña. Para cambiarla se exige la contraseña actual, la nueva debe cumplir las reglas del registro y ser distinta, y al terminar se **cierran las demás sesiones** de la cuenta (la actual se conserva).
- Protección CSRF: Astro rechaza POST de formularios con `Origin` distinto (403); anti open-redirect en `next`.

> El zip original de PP1 no incluía el Auth System, así que se implementó aquí desde cero.

### Limitaciones conocidas (no incluidas a propósito)

Sin recuperación de contraseña ("olvidé mi contraseña", requiere enviar correos), sin verificación de correo, sin cambio de correo y sin pantalla de administración. Las sesiones duran 7 días fijos desde el login (no se renuevan al volver a entrar).

## Estructura

```
db/db.sql                    esquema + semilla (usuario, sesion, pedido.usuario_id)
src/
  middleware.js              sesión + rutas protegidas
  layouts/Layout.astro       topbar + sidebar + footer
  pages/
    index.astro  categoria/[id].astro  checkout.astro
    login.astro  registro.astro  cuenta.astro  pedidos.astro  404.astro
    api/graphql.js  api/auth/{login,register,logout}.js  api/cuenta/{nombre,password}.js
  server/                    db, auth, password, schema, resolvers, gql (ejecución en proceso)
  components/                islas React (+ checkout/)
  store/                     Zustand: carrito, UI, toasts
```

Las páginas `.astro` ejecutan GraphQL **en proceso** (`src/server/gql.js`), sin
hacer una petición HTTP a sí mismas; el navegador usa el mismo esquema vía `/api/graphql`.
