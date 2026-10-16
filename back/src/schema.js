// schema.js — Definición de tipos, queries y mutations del endpoint único GraphQL.
export const typeDefs = /* GraphQL */ `
  type Usuario {
    id: ID!
    nombre: String!
    email: String!
    rol: String!
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
    "Todos los pedidos: solo admin"
    pedidos: [Pedido!]!
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
`;
