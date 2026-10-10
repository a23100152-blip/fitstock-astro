# Reporte — Migración de PP1 + Auth System a Astro

**Alumno:** _[tu nombre y código]_
**Blog:** _[PEGA AQUÍ EL LINK DE TU BLOG]_
**Código:** carpeta `FitStock-Astro/` con `front/` y `back/` (ver README.md raíz para correrlo)

## 1. Objetivo
Migrar la tienda FitStock (PP1: catálogo, ficha de producto, carrito y checkout)
junto con el sistema de autenticación a Astro, conservando todas las funciones.

## 2. Qué se migró
- Catálogo, ficha de producto (modal), carrito (drawer) y checkout de 3 pasos: conservados como islas de React.
- Backend GraphQL con SQLite (libSQL): servidor independiente en `back/` (puerto 4000). Astro (`front/`) solo le habla por HTTP; `/api/graphql` en Astro es un proxy.
- Auth System: registro, login, logout, sesiones por cookie, rutas protegidas y roles (cliente/admin).
- Extras de seguridad: límite de intentos de login (5 fallos / 15 min por correo), limpieza de sesiones vencidas, edición de nombre y cambio de contraseña (pide la actual y cierra las otras sesiones).

## 3. Decisiones técnicas y por qué
0. **Frontend y backend separados**: `front/` nunca importa la base de datos; `back/` es el único que la toca y valida cada token de sesión. Astro solo escribe la cookie httpOnly.
1. **SSR con adaptador Node**: la auth necesita cookies y rutas protegidas en el servidor.
2. **Rutas reales en lugar de estado de navegación**: URLs compartibles, botón "atrás" funcional y el middleware puede proteger rutas.
3. **Islas solo donde hay interactividad**: layout, home, login y pedidos son HTML sin JS; menos JavaScript enviado al navegador.
4. **Zustand en vez de Context para toasts/UI**: cada isla es un árbol de React independiente, Context no se comparte entre ellas; los módulos sí.
5. **Carrito en localStorage**: al ser multipágina, el estado en memoria se perdería al navegar.
6. **Sesiones con token hasheado en BD + cookie httpOnly**: un volcado de la BD no permite suplantar sesiones.
7. **BD persistente**: el original la borraba en cada arranque, incompatible con usuarios reales.

## 4. Problemas encontrados
- Al separar, el middleware y las páginas tuvieron que dejar de ejecutar resolvers en proceso y pasar a `fetch` hacia el backend; el endpoint `/api/graphql` pasó a ser un proxy que reenvía el token como `Authorization: Bearer`.
- Las imágenes importadas con Vite devuelven metadatos en Astro → se movieron a `public/` y se mapean por URL.
- `ToastContext` no funcionaba entre islas → se migró a un store.

## 5. Pruebas realizadas
Backend verificado de forma independiente con `curl` (login, registro, `yo`, cambio de nombre/contraseña, logout, bloqueo por intentos). La integración front↔back se prueba corriendo ambas partes (ver guion de la sección 6). Pruebas del sistema original:
- Rutas privadas sin sesión → 302 a `/login?next=…`; tras login regresan a la ruta original.
- `crearPedido` sin sesión → `UNAUTHENTICATED`; cliente intentando mutaciones de admin → `FORBIDDEN`.
- Pedido con sesión: total calculado en servidor, stock descontado (25 → 23), stock insuficiente rechazado.
- Registro con correo duplicado rechazado; logout invalida la sesión; POST con `Origin` ajeno → 403.
- Límite de intentos: tras 5 fallos el login se bloquea incluso con la contraseña correcta; otro usuario no se ve afectado; un login exitoso reinicia el contador.
- Cambio de contraseña: rechaza contraseña actual incorrecta, confirmación distinta, contraseña débil e igual a la actual; al cambiarla, la sesión actual sigue y las de otros dispositivos se cierran.
- Sesiones vencidas: una fila vencida se elimina en el siguiente login.
- Flujo completo: agregar al carrito → recargar (persiste) → login → checkout → pedido en `/pedidos`.

## 6. Guion para la entrega presencial
1. Terminal 1: `cd back && npm install && npm run dev` (:4000). Terminal 2: `cd front && npm install && npm run dev` → abrir http://localhost:4321
2. Navegar por categorías; buscar y ordenar; abrir ficha de un producto.
3. Agregar productos, abrir el carrito, recargar la página (el carrito persiste).
4. "Ir a pagar" sin sesión → se redirige a login; entrar con `demo@fitstock.com / Demo1234`.
5. Completar los 3 pasos del checkout → confirmación → "Mis pedidos".
6. Cerrar sesión y mostrar que `/pedidos` vuelve a pedir login.
7. (Opcional) Registrar un usuario nuevo y mostrar el hash en la BD.

## 7. Conclusiones
_[Escribe aquí 2–3 líneas con lo que aprendiste: SSR vs SPA, islas, manejo de sesiones.]_
