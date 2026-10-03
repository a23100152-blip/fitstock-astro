// /api/graphql — Endpoint único GraphQL (sustituye al servidor Yoga en :4000).
// Le pasamos el usuario de la sesión como contexto para autorizar resolvers.
import { createYoga } from 'graphql-yoga';
import { schema } from '../../server/gql.js';

const yoga = createYoga({
  schema,
  graphqlEndpoint: '/api/graphql',
  landingPage: false,
});

export const prerender = false;

export const ALL = async ({ request, locals }) => {
  const res = await yoga.fetch(request, { user: locals.user ?? null });
  // Yoga usa su propia clase Response; Astro exige la Response nativa de Node.
  return new Response(await res.text(), {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
  });
};
