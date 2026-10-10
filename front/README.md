# FitStock — Frontend (Astro)

Tienda de suplementos, ropa y accesorios (PP1) con sistema de autenticación.
Este es el **frontend** en Astro (SSR + islas de React). **No toca la base de
datos**: todo dato lo pide por HTTP al backend GraphQL independiente de la
carpeta `../back`.

## Cómo correrlo

Requiere **Node 22+** y el backend corriendo en `BACKEND_URL` (ver `.env`,
por defecto `http://localhost:4000`).

```bash
npm install
npm run dev          # http://localhost:4321
```

Producción: se despliega en Netlify con `@astrojs/netlify` (ver `netlify.toml`).
Define la variable de entorno `BACKEND_URL` apuntando a donde esté desplegado
el backend (el backend es un servidor Node aparte; no corre en Netlify).

### Cuentas de demostración

| Rol     | Correo               | Contraseña |
|---------|----------------------|------------|
| Cliente | demo@fitstock.com    | Demo1234   |
| Admin   | admin@fitstock.com   | Admin1234  |

## Qué cambió en la migración

| Antes (PP1)                                   | Ahora (Astro)                                              |
|-----------------------------------------------|------------------------------------------------------------|
| SPA de React, navegación con Zustand (`vista`)| Rutas por archivo: `/`, `/categoria/[id]`, `/checkout`…    |
| Backend aparte en `:4000` (Yoga)              | Sigue aparte (`../back`); Astro le habla por HTTP (`src/lib/backend.js`) |
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

- **Registro / login / logout** con formularios HTML normales → `src/pages/api/auth/*` (proxies hacia el backend).
- **Contraseñas**: `scrypt` con salt aleatorio y comparación en tiempo constante (en el backend: `back/src/password.js`).
- **Sesiones**: token aleatorio en cookie `httpOnly` + `SameSite=Lax`; en la BD solo se guarda su SHA-256 (`back/src/auth.js`). Expiran a los 7 días.
- **Middleware** (`src/middleware.js`): consulta `yo` al backend con la cookie y pone `Astro.locals.user` en cada petición, protege `/checkout`, `/cuenta` y `/pedidos` (redirige a `/login?next=…`) y saca de `/login` a quien ya tiene sesión.
- **Autorización en GraphQL** (`back/src/resolvers.js`): `crearPedido` y `misPedidos` requieren sesión; `pedido(id)` solo para su dueño o admin; `pedidos`, `crearProducto`, `actualizarProducto`, `eliminarProducto` y `actualizarEstadoPedido` solo admin.
- **Límite de intentos de login** (`back/src/resolvers.js` + `back/src/auth.js`): 5 fallos por correo en 15 minutos bloquean el login (aunque la contraseña sea correcta) hasta que pase la ventana. Un login exitoso borra los fallos. Se cuenta por correo, exista o no la cuenta, para no revelar qué correos están registrados.
- **Limpieza de sesiones vencidas**: cada login/registro borra de la tabla `sesion` las filas con `expira_en` pasado.
- **Mi cuenta** (`/cuenta`): editar nombre y cambiar contraseña. Para cambiarla se exige la contraseña actual, la nueva debe cumplir las reglas del registro y ser distinta, y al terminar se **cierran las demás sesiones** de la cuenta (la actual se conserva).
- Protección CSRF: Astro rechaza POST de formularios con `Origin` distinto (403); anti open-redirect en `next`.

> El zip original de PP1 no incluía el Auth System, así que se implementó aquí desde cero.

### Limitaciones conocidas (no incluidas a propósito)

Sin recuperación de contraseña ("olvidé mi contraseña", requiere enviar correos), sin verificación de correo, sin cambio de correo y sin pantalla de administración. Las sesiones duran 7 días fijos desde el login (no se renuevan al volver a entrar).

## Estructura

```
src/
  lib/backend.js             ÚNICO punto de contacto con el backend (fetch HTTP) + cookie de sesión
  middleware.js              sesión (vía backend) + rutas protegidas
  layouts/Layout.astro       topbar + sidebar + footer
  pages/
    index.astro  categoria/[id].astro  checkout.astro
    login.astro  registro.astro  cuenta.astro  pedidos.astro  404.astro
    api/graphql.js           proxy hacia el backend (para las islas del navegador)
    api/auth/{login,register,logout}.js  api/cuenta/{nombre,password}.js   proxies delgados
  components/                islas React (+ checkout/)
  store/                     Zustand: carrito, UI, toasts
```

Las páginas `.astro` y los endpoints hacen `fetch` al backend
(`backendGraphQL()`); el navegador usa `/api/graphql` del mismo origen, que
reenvía la petición al backend con `Authorization: Bearer <token>`.
