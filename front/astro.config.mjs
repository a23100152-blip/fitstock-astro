import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import netlify from '@astrojs/netlify';
const isDev = process.argv.includes('dev');

export default defineConfig({
  output: 'server',
  adapter: isDev ? undefined : netlify(),
  integrations: [react()],
  server: { port: 4321 },
});