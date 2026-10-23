# FitStock — Full BackOffice (ERP) con GraphQL Subscriptions

## ¿Qué es un ERP?

Un **ERP** (*Enterprise Resource Planning*, "planificación de recursos empresariales") es un sistema que **integra en un solo lugar y con una sola base de datos** los procesos internos de un negocio: ventas, inventario, catálogo, clientes, usuarios, finanzas y reportes. En lugar de llevar cada área en una herramienta distinta (una hoja de cálculo para el inventario, otra para los pedidos, el correo para los clientes…), todas las áreas comparten la misma información en tiempo real.

Sus características principales son:

| Característica | Qué significa | Cómo se aplica en FitStock |
|---|---|---|
| **Base de datos única** | Todos los módulos leen y escriben los mismos datos | Pedidos, productos, inventario y usuarios viven en la misma BD (libSQL/Turso) |
| **Módulos integrados** | Cada área es un módulo, pero conectado con los demás | Una venta descuenta inventario, genera un movimiento en el kardex y aparece en el dashboard |
| **Información en tiempo real** | Lo que pasa en un área se ve al instante en las demás | GraphQL Subscriptions: pedidos, stock y actividad llegan solos al BackOffice |
| **Control de acceso por roles** | Cada persona ve y hace solo lo que le corresponde | Solo el rol `admin` entra al BackOffice; el backend valida cada operación |
| **Trazabilidad / auditoría** | Queda registro de quién hizo qué y cuándo | Bitácora de auditoría y kardex de inventario |
| **Reportes** | Indicadores para tomar decisiones | Dashboard con ingresos, ticket promedio, productos más vendidos, inventario bajo |

El **BackOffice** es la parte del sistema que **no ve el cliente**: el panel interno desde donde el negocio opera (el "detrás del mostrador"). El de FitStock está construido como un ERP pequeño para una tienda en línea.

---

## Módulos del BackOffice

Entrar con `admin@fitstock.com` / `Admin1234` → botón **🗂️ BackOffice** (`/admin`).

| Módulo | Ruta | Qué permite | Tiempo real |
|---|---|---|---|
| 📊 Dashboard | `/admin` | KPIs de ventas, gráficas, inventario bajo, pedidos recientes y actividad | Feed de actividad en vivo |
| 🧾 Pedidos | `/admin/pedidos` | Buscar y filtrar, cambiar estado de pago y de envío, ver detalle (productos, dirección, referencia de pago), cancelar con devolución de stock | Pedidos nuevos y cambios aparecen solos |
| 📦 Productos | `/admin/productos` | Alta, edición y baja; filtros; valor del inventario; movimientos de stock (entrada, salida, ajuste) | El stock se actualiza solo (ej. cuando un cliente compra) |
| 🏷️ Inventario | `/admin/inventario` | **Kardex**: historial de cada movimiento (inicial, entrada, salida, ajuste, venta, devolución) con usuario y motivo; productos por resurtir | Se refresca con cada cambio de stock |
| 🗂️ Categorías | `/admin/categorias` | Alta, edición y baja (solo si no tiene productos) | Se refresca si otro admin cambia algo |
| 👥 Usuarios | `/admin/usuarios` | Alta con rol, editar nombre/rol, activar/desactivar (cierra sus sesiones), restablecer contraseña; pedidos y total comprado por cliente | Registros nuevos aparecen solos |
| 📡 Actividad en vivo | `/admin/bitacora` | Bitácora de auditoría filtrable por módulo | Cada evento llega al instante |

**Reglas de negocio:**
- Un producto que ya aparece en pedidos no se borra (se deja con stock 0 para retirarlo).
- Una categoría con productos no se borra.
- El stock nunca puede quedar negativo.
- Un admin no puede desactivarse ni quitarse el rol a sí mismo, y siempre debe quedar al menos un admin activo.
- Un usuario desactivado no puede iniciar sesión y pierde sus sesiones abiertas.
- Cada cambio de stock se guarda **en la misma transacción** que su movimiento de kardex.

---

## GraphQL Subscriptions

Una **Subscription** es el tercer tipo de operación de GraphQL (junto con Query y Mutation): en lugar de pedir datos una vez, el cliente **se suscribe** a un evento y el servidor le **empuja** los datos cada vez que ocurre.

```graphql
type Subscription {
  eventoBackoffice: EventoBackoffice!   # bitácora: altas, cambios, pedidos, pagos, stock
  pedidoActualizado: Pedido!            # pedido nuevo o cambio de estado de pago/envío
  stockActualizado: Producto!           # cambió el inventario de un producto
}
```

### Cómo funciona

```
Mutation (ej. un cliente compra)               BackOffice abierto (admin)
        │                                               ▲
        ▼                                               │ evento "next" (SSE)
 resolvers.js ── registrarEvento / notificarStock ──► pubSub (graphql-yoga)
                                                        │
                       back: GET /graphql (text/event-stream, Authorization: Bearer)
                                                        │
                       front: /api/admin/stream (proxy SSE con la cookie de sesión)
                                                        │
                       navegador: EventSource → useSuscripcion() → React actualiza la tabla
```

- **Transporte:** graphql-yoga sirve las suscripciones por **SSE** (*Server-Sent Events*), un estándar HTTP del navegador (`EventSource`) que no necesita WebSockets ni librerías extra.
- **Publicación:** `back/src/eventos.js` crea el `pubSub` con `createPubSub()` y lo usa en tres canales. Las mutations publican después de guardar en la base.
- **Seguridad:** cada suscripción valida en el backend que el usuario sea `admin`. Además, el middleware de Astro bloquea `/api/admin/*` a quien no lo sea. El token nunca llega al JavaScript del navegador, porque viaja en la cookie `httpOnly` y el proxy lo convierte en `Authorization: Bearer`.
- **Reconexión:** `EventSource` se reconecta solo. Al reconectar, cada módulo vuelve a consultar sus datos, así que no se pierden eventos aunque la conexión se corte (por ejemplo, por el límite de tiempo de las funciones de Netlify).

### Probarlo

1. Abre `/admin/pedidos` con el admin. Arriba a la derecha debe decir **🟢 En vivo**.
2. En otra ventana de incógnito, entra como `demo@fitstock.com` / `Demo1234` y haz una compra.
3. Sin recargar, el pedido aparece resaltado en la tabla del admin. En `/admin/productos` el stock baja, y en `/admin/bitacora` aparece "Nuevo pedido #…".

También se pueden probar en Apollo Sandbox o con `curl` contra el backend:

```bash
curl -N -H "Accept: text/event-stream" -H "Authorization: Bearer <token de admin>" \
  "http://localhost:4000/graphql?query=subscription%7BeventoBackoffice%7Bmensaje%20usuario%7D%7D"
```

---

## Cambios en el código

### Backend (`back/`)

| Archivo | Cambio |
|---|---|
| `db.sql` / `src/db.js` | Columna `usuario.activo`; tablas `movimiento_inventario` (kardex) y `bitacora`; migración automática para bases existentes (incluida Turso) |
| `src/eventos.js` | **Nuevo.** `pubSub`, `registrarEvento`, `notificarPedido` y `notificarStock` |
| `src/inventario.js` | **Nuevo.** `registrarMovimiento` del kardex (dentro de transacciones) |
| `src/schema.js` | Tipos `MovimientoInventario` y `EventoBackoffice`; queries `usuarios`, `movimientosInventario` y `bitacora`; filtros en `pedidos`; mutations de categorías, `ajustarStock` y gestión de usuarios; **type Subscription** |
| `src/resolvers.js` | Resolvers del BackOffice, validaciones, auditoría y kardex en ventas, cancelaciones y ediciones; resolvers de `Subscription` con validación de admin |
| `src/auth.js` | Las cuentas desactivadas no pueden iniciar sesión ni usar sesiones abiertas |
| `src/pedidos.js` | La cancelación registra la devolución en el kardex y notifica en vivo |

### Frontend (`front/`)

| Archivo | Cambio |
|---|---|
| `src/pages/api/admin/stream.js` | **Nuevo.** Proxy SSE de suscripciones (solo operaciones `subscription`) |
| `src/components/backoffice/api.jsx` | **Nuevo.** `suscribir()` con `EventSource`, hook `useSuscripcion()` e indicador "En vivo" |
| `src/components/backoffice/*.jsx` | **Nuevos.** Islas de React: `PedidosAdmin`, `ProductosAdmin`, `InventarioAdmin`, `CategoriasAdmin`, `UsuariosAdmin`, `ActividadEnVivo` y `Modal` |
| `src/components/backoffice/AdminNav.astro` | **Nuevo.** Menú de módulos (HTML estático) |
| `src/pages/admin/*.astro` | **Nuevas** páginas: pedidos, productos, inventario, categorías, usuarios y bitácora; el dashboard suma el menú y la actividad en vivo |
| `src/styles/global.css` | Estilos del BackOffice |

### Nuevas operaciones GraphQL (todas solo admin)

| Tipo | Operación |
|---|---|
| Query | `usuarios(busqueda, rol)` · `movimientosInventario(productoId, limite)` · `bitacora(entidad, limite)` · `pedidos(estado, estadoPago, busqueda, limite)` |
| Mutation | `crearCategoria` · `actualizarCategoria` · `eliminarCategoria` · `ajustarStock(productoId, cantidad, tipo, motivo)` · `crearUsuarioAdmin` · `actualizarUsuario` · `cambiarEstadoUsuario` · `restablecerPasswordUsuario` |
| Subscription | `eventoBackoffice` · `pedidoActualizado` · `stockActualizado` |
