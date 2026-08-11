import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const rawGambar = (env.VITE_GAMBAR_BASE || '').trim()

  // Dev (Vite :5176): /gambar di-proxy ke XAMPP agar ikon same-origin (PWA terbaca)
  // Build lokal XAMPP: /mdtwustha/gambar — deploy: set VITE_GAMBAR_BASE
  const GAMBAR_BASE =
    rawGambar !== ''
      ? rawGambar.replace(/\/$/, '')
      : command === 'serve'
        ? '/gambar'
        : '/mdtwustha/gambar'

  const appBase = command === 'serve' ? '/' : env.VITE_APP_BASE?.trim() || '/mdtwustha/app/'
  const normalizedBase = appBase.endsWith('/') ? appBase : `${appBase}/`
  const startUrl = normalizedBase === '/' ? '/' : normalizedBase

  return {
    base: command === 'serve' ? '/' : normalizedBase,
    plugins: [
      react(),
      {
        name: 'html-transform-gambar-base',
        transformIndexHtml(html: string) {
          return html
            .replace(/href="\/gambar\//g, `href="${GAMBAR_BASE}/`)
            .replace(/content="\/gambar\//g, `content="${GAMBAR_BASE}/`)
        },
      },
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: false,
        strategies: 'injectManifest',
        srcDir: 'public',
        filename: 'sw.js',
        includeAssets: [],
        injectManifest: {
          globPatterns: ['**/*.{js,css,ico,png,svg,jpg,jpeg,woff2,webmanifest}'],
          globIgnores: ['**/index.html'],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        },
        manifest: {
          name: 'MDT Wustha',
          short_name: 'MDT Wustha',
          description: 'MDT Wustha — aplikasi pengelolaan madrasah diniyah',
          theme_color: '#2563eb',
          background_color: '#f8fafc',
          display: 'standalone',
          scope: startUrl,
          start_url: startUrl,
          orientation: 'any',
          lang: 'id',
          dir: 'ltr',
          categories: ['education', 'productivity'],
          icons: [
            { src: `${GAMBAR_BASE}/logo/icon192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: `${GAMBAR_BASE}/logo/icon512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: `${GAMBAR_BASE}/logo/icon.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            { src: `${GAMBAR_BASE}/logo/icon32.png`, sizes: '32x32', type: 'image/png', purpose: 'any' },
            { src: `${GAMBAR_BASE}/logo/icon64.png`, sizes: '64x64', type: 'image/png', purpose: 'any' },
            { src: `${GAMBAR_BASE}/logo/icon96.png`, sizes: '96x96', type: 'image/png', purpose: 'any' },
            { src: `${GAMBAR_BASE}/logo/icon128.png`, sizes: '128x128', type: 'image/png', purpose: 'any' },
          ],
          screenshots: [
            {
              src: `${GAMBAR_BASE}/ss/ss-hp1.png`,
              sizes: '627x1020',
              type: 'image/png',
              form_factor: 'narrow',
              label: 'Beranda (HP)',
            },
            {
              src: `${GAMBAR_BASE}/ss/ss-hp2.png`,
              sizes: '627x1020',
              type: 'image/png',
              form_factor: 'narrow',
              label: 'Absensi (HP)',
            },
            {
              src: `${GAMBAR_BASE}/ss/ss-hp3.png`,
              sizes: '627x1020',
              type: 'image/png',
              form_factor: 'narrow',
              label: 'Nilai (HP)',
            },
            {
              src: `${GAMBAR_BASE}/ss/ss-hp4.png`,
              sizes: '627x1020',
              type: 'image/png',
              form_factor: 'narrow',
              label: 'Jadwal (HP)',
            },
            {
              src: `${GAMBAR_BASE}/ss/ss-pc1.png`,
              sizes: '1920x1020',
              type: 'image/png',
              form_factor: 'wide',
              label: 'Dashboard (PC)',
            },
            {
              src: `${GAMBAR_BASE}/ss/ss-pc2.png`,
              sizes: '1920x1020',
              type: 'image/png',
              form_factor: 'wide',
              label: 'Data Santri (PC)',
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
          navigateFallback: 'index.html',
        },
      }),
    ],
    server: {
      host: '0.0.0.0',
      port: 5176,
      proxy: {
        '/gambar': {
          target: 'http://127.0.0.1',
          changeOrigin: true,
          rewrite: (path) => `/mdtwustha${path}`,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (id.includes('xlsx')) return 'xlsx'
            if (id.includes('framer-motion')) return 'framer-motion'
            if (id.includes('react-router') || id.includes('react-dom') || id.includes('/react/')) {
              return 'react-vendor'
            }
          },
        },
      },
    },
  }
})
