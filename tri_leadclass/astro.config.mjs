// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

// Web jurnal mandiri: SSR penuh (frontend + backend API) memakai adapter Node.
// Di VPS cukup jalankan: node ./dist/server/entry.mjs
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  // Di belakang nginx: tanpa allowedDomains, checkOrigin CSRF membandingkan
  // Origin browser (https://domain) vs url internal (http://127.0.0.1) → POST 403.
  security: {
    allowedDomains: [
      { hostname: 'trileadclass.my.id', protocol: 'https' },
      { hostname: 'www.trileadclass.my.id', protocol: 'https' },
      { hostname: 'admin.trileadclass.my.id', protocol: 'https' },
      { hostname: 'penulis.trileadclass.my.id', protocol: 'https' },
    ],
  },
  server: {
    host: true,
    port: Number(process.env.PORT ?? 4321),
  },
  vite: {
    plugins: [tailwindcss()],
    // better-sqlite3 adalah modul native; jangan di-bundle oleh Vite/Rollup.
    ssr: {
      external: ['better-sqlite3'],
    },
  },
});
