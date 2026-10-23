// schema.js — Definición de tipos, queries y mutations del endpoint único GraphQL.
export const typeDefs = /* GraphQL */ `
  type Usuario {
    id: ID!
    nombre: String!
    email: String!
    rol: String!
    "BackOffice: false = cuenta desactivada (no puede iniciar sesión)"
    activo: Boolean!
    fechaCreacion: String
    "BackOffice: pedidos pagados del usuario"
    totalPedidos: Int!
    "BackOffice: suma de sus pedidos pagados"
    totalGastado: Float!
  }

  # ================= BackOffice (ERP) =================
  "Movimiento del kardex de inventario: cada entrada o salida de stock."
  type MovimientoInventario {
    id: ID!
    producto: Producto
    "inicial | entrada | salida | ajuste | venta | devolucion"
    tipo: String!
    "Positiva = entra al almacén · negativa = sale"
    cantidad: Int!
    stockResultante: Int!
    motivo: String
    usuario: String
    pedidoId: ID
    fecha: String!
  }

  "Registro de la bitácora de auditoría (también llega en tiempo real por suscripción)."
  type EventoBackoffice {
    id: ID!
    "crear | actualizar | eliminar | stock | estado | pago | registro | pedido"
    accion: String!
    "producto | categoria | usuario | pedido | inventario"
    entidad: String!
    entidadId: ID
    mensaje: String!
    "Quién lo hizo"
    usuario: String
    fecha: String!
  }

  input CategoriaInput {
    nombre: String!
    descripcion: String
    icono: String
  }

  input UsuarioAdminInput {
    nombre: String!
    email: String!
    password: String!
    "cliente | admin"
    rol: String!
  }

  input UsuarioUpdateInput {
    nombre: String
    rol: String
  }

  type Categoria {
    id: ID!
    nombre: String!
    descripcion: String
    icono: String
    productos: [Producto!]!
  }

  type Producto {
    id: ID!
    nombre: String!
    descripcion: String
    precio: Float!
    stock: Int!
    imagenUrl: String
    infoNutricional: String
    categoria: Categoria!
  }

  type AuthPayload {
    token: String!
    usuario: Usuario!
  }

  type Direccion {
    id: ID!
    calle: String!
    numero: String
    ciudad: String!
    estado: String!
    cp: String!
    pais: String!
    telefono: String!
  }

  type DetallePedido {
    id: ID!
    producto: Producto!
    cantidad: Int!
    precioUnitario: Float!
    subtotal: Float!
  }

  type Pedido {
    id: ID!
    nombreContacto: String!
    emailContacto: String!
    metodoPago: String!
    subtotal: Float!
    envio: Float!
    total: Float!
    estado: String!
    "Estado del cobro: pendiente | pagado | cancelado"
    estadoPago: String!
    "Id de la transacción en la pasarela (PayPal / Mercado Pago)"
    referenciaPago: String
    fechaPago: String
    fechaCreacion: String!
    direccion: Direccion!
    detalles: [DetallePedido!]!
  }

  "Resultado de iniciar un cobro: a dónde mandar al cliente para que pague."
  type PagoInicio {
    metodo: String!
    "real = pasarela de PayPal/Mercado Pago; simulado = sin credenciales configuradas"
    modo: String!
    urlPago: String!
    referencia: String
  }

  input PagoTarjetaMPInput {
    "Token de un solo uso que genera MercadoPago.js (Secure Fields) en el navegador"
    token: String!
    "visa, master, amex..."
    metodoPagoId: String!
    cuotas: Int
    emisorId: String
  }

  "Resultado de cobrar con tarjeta vía Mercado Pago (Checkout API)."
  type PagoTarjetaResultado {
    "approved | rejected | in_process | pending"
    estadoPasarela: String!
    aprobado: Boolean!
    mensaje: String!
    pedido: Pedido!
  }

  # ---- Dashboard de administrador ----
  type ResumenVentas {
    ingresosTotales: Float!
    ingresosPeriodoAnterior: Float!
    "Variación % contra el periodo anterior (null si no hay base de comparación)"
    variacionIngresos: Float
    pedidosPagados: Int!
    pedidosTotales: Int!
    pedidosPendientesPago: Int!
    ticketPromedio: Float!
    unidadesVendidas: Int!
    clientes: Int!
    productos: Int!
  }
  type VentaDia { fecha: String!, ingresos: Float!, pedidos: Int! }
  type VentaMetodo { metodo: String!, ingresos: Float!, pedidos: Int! }
  type VentaCategoria { categoria: String!, ingresos: Float!, unidades: Int! }
  type ProductoVendido { producto: String!, unidades: Int!, ingresos: Float! }
  type ConteoEstado { estado: String!, pedidos: Int! }

  type EstadisticasAdmin {
    dias: Int!
    desde: String!
    hasta: String!
    resumen: ResumenVentas!
    ventasPorDia: [VentaDia!]!
    ventasPorMetodo: [VentaMetodo!]!
    ventasPorCategoria: [VentaCategoria!]!
    productosMasVendidos: [ProductoVendido!]!
    pedidosPorEstado: [ConteoEstado!]!
    stockBajo: [Producto!]!
    pedidosRecientes: [Pedido!]!
  }

  type Query {
    categorias: [Categoria!]!
    categoria(id: ID!): Categoria
    productos(categoriaId: ID): [Producto!]!
    producto(id: ID!): Producto
    "Usuario autenticado (null si no hay sesión)"
    yo: Usuario
    "Pedidos del usuario autenticado"
    misPedidos: [Pedido!]!
    "Un pedido: solo su dueño o un admin"
    pedido(id: ID!): Pedido
    "Todos los pedidos (con filtros opcionales): solo admin"
    pedidos(estado: String, estadoPago: String, busqueda: String, limite: Int = 200): [Pedido!]!

    # ---- BackOffice (solo admin) ----
    "Usuarios del sistema con búsqueda por nombre/correo y filtro por rol"
    usuarios(busqueda: String, rol: String): [Usuario!]!
    "Kardex: movimientos de inventario (de un producto o de todos)"
    movimientosInventario(productoId: ID, limite: Int = 100): [MovimientoInventario!]!
    "Bitácora de auditoría"
    bitacora(entidad: String, limite: Int = 100): [EventoBackoffice!]!
    "Dashboard de administrador: estadísticas de ventas de los últimos N días (solo admin)"
    estadisticasAdmin(dias: Int = 30): EstadisticasAdmin!
  }

  input DireccionInput {
    calle: String!
    numero: String
    ciudad: String!
    estado: String!
    cp: String!
    pais: String
    telefono: String!
  }

  input ItemPedidoInput {
    productoId: ID!
    cantidad: Int!
  }

  input CrearPedidoInput {
    nombreContacto: String!
    emailContacto: String!
    metodoPago: String!
    direccion: DireccionInput!
    items: [ItemPedidoInput!]!
  }

  input ProductoInput {
    nombre: String!
    descripcion: String
    precio: Float!
    stock: Int!
    imagenUrl: String
    infoNutricional: String
    categoriaId: ID!
  }

  input ProductoUpdateInput {
    nombre: String
    descripcion: String
    precio: Float
    stock: Int
    imagenUrl: String
    infoNutricional: String
    categoriaId: ID
  }

  type Mutation {
    crearProducto(input: ProductoInput!): Producto!
    actualizarProducto(id: ID!, input: ProductoUpdateInput!): Producto!
    eliminarProducto(id: ID!): Boolean!

    """
    Operación central del Checkout: valida stock, crea la dirección,
    registra el pedido con sus detalles y descuenta el inventario —
    todo en una sola transacción.
    """
    crearPedido(input: CrearPedidoInput!): Pedido!
    actualizarEstadoPedido(id: ID!, estado: String!): Pedido!

    "Métodos de cobro — crea la orden en PayPal y devuelve la URL de pago."
    iniciarPago(pedidoId: ID!): PagoInicio!
    "Mercado Pago (formulario propio) — cobra el pedido con el token de la tarjeta; el monto sale de la base de datos."
    pagarConTarjetaMP(pedidoId: ID!, input: PagoTarjetaMPInput!): PagoTarjetaResultado!
    "Métodos de cobro — al volver de la pasarela, verifica el pago con ella y marca el pedido como pagado."
    confirmarPago(pedidoId: ID!, referencia: String): Pedido!
    "Métodos de cobro — el cliente canceló o el pago falló: cancela el pedido y devuelve el stock."
    cancelarPago(pedidoId: ID!): Pedido!
    "Admin — confirma manualmente un cobro (p. ej. una transferencia) o lo regresa a pendiente."
    actualizarEstadoPago(id: ID!, estadoPago: String!): Pedido!

    # ---- BackOffice (solo admin) ----
    "Categorías: alta, edición y baja (solo si no tiene productos)"
    crearCategoria(input: CategoriaInput!): Categoria!
    actualizarCategoria(id: ID!, input: CategoriaInput!): Categoria!
    eliminarCategoria(id: ID!): Boolean!
    "Inventario: suma (entrada) o resta (salida/merma) stock y lo registra en el kardex"
    ajustarStock(productoId: ID!, cantidad: Int!, tipo: String!, motivo: String!): Producto!
    "Usuarios: alta con rol, edición, activar/desactivar y restablecer contraseña"
    crearUsuarioAdmin(input: UsuarioAdminInput!): Usuario!
    actualizarUsuario(id: ID!, input: UsuarioUpdateInput!): Usuario!
    cambiarEstadoUsuario(id: ID!, activo: Boolean!): Usuario!
    restablecerPasswordUsuario(id: ID!, nueva: String!): Boolean!

    "Auth System — inicia sesión y devuelve un token de sesión."
    iniciarSesion(email: String!, password: String!): AuthPayload!

    "Auth System — crea una cuenta y devuelve un token de sesión."
    registrarUsuario(nombre: String!, email: String!, password: String!, confirm: String!): AuthPayload!

    "Auth System — invalida el token de sesión actual."
    cerrarSesion: Boolean!

    "Requiere sesión. Cambia el nombre del usuario autenticado."
    actualizarNombre(nombre: String!): Usuario!

    "Requiere sesión. Cambia la contraseña y cierra las demás sesiones."
    cambiarPassword(actual: String!, nueva: String!, confirm: String!): Boolean!
  }

  # ================= GraphQL Subscriptions (tiempo real, solo admin) =================
  # Viajan por SSE (Server-Sent Events): el BackOffice se actualiza solo, sin recargar.
  type Subscription {
    "Cada acción registrada en la bitácora (altas, cambios, pedidos, pagos, stock…)"
    eventoBackoffice: EventoBackoffice!
    "Un pedido se creó o cambió de estado de envío o de pago"
    pedidoActualizado: Pedido!
    "Cambió el stock de un producto (venta, devolución, ajuste)"
    stockActualizado: Producto!
  }
`;
