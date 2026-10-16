// client.js — Cliente GraphQL minimalista sobre fetch.
// Ahora el endpoint es el mismo origen (/api/graphql): la cookie de sesión
// viaja sola y el backend sabe quién hace la petición.
const ENDPOINT = '/api/graphql';

export async function graphqlRequest(query, variables = {}) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();

  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors[0].message);
  }
  return json.data;
}

export const QUERY_PRODUCTO = /* GraphQL */ `
  query Producto($id: ID!) {
    producto(id: $id) {
      id
      nombre
      descripcion
      precio
      stock
      imagenUrl
      infoNutricional
      categoria {
        id
        nombre
      }
    }
  }
`;

export const MUTATION_CREAR_PEDIDO = /* GraphQL */ `
  mutation CrearPedido($input: CrearPedidoInput!) {
    crearPedido(input: $input) {
      id
      subtotal
      envio
      total
      estado
      fechaCreacion
      nombreContacto
      emailContacto
      metodoPago
      estadoPago
      direccion {
        calle
        numero
        ciudad
        estado
        cp
      }
      detalles {
        cantidad
        precioUnitario
        subtotal
        producto {
          nombre
        }
      }
    }
  }
`;

// ---- Métodos de cobro (PayPal / Mercado Pago) ----
export const MUTATION_INICIAR_PAGO = /* GraphQL */ `
  mutation IniciarPago($pedidoId: ID!) {
    iniciarPago(pedidoId: $pedidoId) {
      metodo
      modo
      urlPago
    }
  }
`;

export const MUTATION_CANCELAR_PAGO = /* GraphQL */ `
  mutation CancelarPago($pedidoId: ID!) {
    cancelarPago(pedidoId: $pedidoId) {
      id
      estado
      estadoPago
    }
  }
`;

// ---- Mercado Pago (Checkout API, formulario propio) ----
export const MUTATION_PAGAR_TARJETA_MP = /* GraphQL */ `
  mutation PagarConTarjetaMP($pedidoId: ID!, $input: PagoTarjetaMPInput!) {
    pagarConTarjetaMP(pedidoId: $pedidoId, input: $input) {
      estadoPasarela
      aprobado
      mensaje
      pedido {
        id
        subtotal
        envio
        total
        estado
        estadoPago
        fechaCreacion
        nombreContacto
        emailContacto
        metodoPago
        direccion { calle numero ciudad estado cp }
        detalles { cantidad precioUnitario subtotal producto { nombre } }
      }
    }
  }
`;
