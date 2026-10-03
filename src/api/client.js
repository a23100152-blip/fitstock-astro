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
