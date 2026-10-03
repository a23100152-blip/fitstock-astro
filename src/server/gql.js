// gql.js — Esquema ejecutable único. Lo usan:
//   1) el endpoint HTTP /api/graphql (islas React en el navegador), y
//   2) las páginas .astro en el servidor, ejecutando consultas en proceso
//      (sin hacer una petición HTTP a nosotros mismos).
import { createSchema } from 'graphql-yoga';
import { graphql } from 'graphql';
import { typeDefs } from './schema.js';
import { resolvers } from './resolvers.js';

export const schema = createSchema({ typeDefs, resolvers });

export async function ejecutar(source, variableValues = {}, user = null) {
  const res = await graphql({ schema, source, variableValues, contextValue: { user } });
  if (res.errors?.length) throw new Error(res.errors[0].message);
  return res.data;
}
