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
    fechaCreacion: String!
    direccion: Direccion!
    detalles: [DetallePedido!]!
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
  }
`;
