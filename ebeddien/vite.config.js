import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'fs'
import path from 'path'

/** Dev saja: manifest.webmanifest valid JSON (tanpa plugin PWA yang di-disable di serve). */
function manifestWebmanifestDevPlugin({ gambarBase, startUrl }) {
  const manifestBody = JSON.stringify({
    name: 'eBeddien - Digital Service Center',
    short_name: 'eBeddien',
    description: 'eBeddien - Digital Service Center',
    start_url: startUrl,
    scope: '/',
    display: 'minimal-ui',
    theme_color: '#0d9488',
    background_color: '#D9F8F4',
    lang: 'id',
    icons: [
      {
        src: `${gambarBase}/icon/ebeddienicon192.png`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  })

  return {
    name: 'manifest-webmanifest-dev',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathOnly = req.url?.split('?')[0] || ''
        if (pathOnly !== '/manifest.webmanifest') return next()
        res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8')
        res.end(manifestBody)
      })
    },
  }
}

/** Dev: tangani GET /sw.js* dengan stub tanpa `import` — cache browser/SW lama masih meminta file ini. */
function devServiceWorkerStubPlugin() {
  const stub = `/* vite dev — stub; production pakai sw.js hasil build */
self.addEventListener('install', (e) => {
  e.waitUntil(self.skipWaiting())
})
self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim())
})
`
  return {
    name: 'dev-sw-stub',
    enforce: 'pre',
    configureServer(server) {
      const handler = (req, res, next) => {
        const raw = req.url?.split('?')[0] || ''
        if (raw !== '/sw.js') return next()
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
        res.end(stub)
      }
      // Harus di atas static `public/` supaya /sw.js tidak dilayani mentah (ber-import workbox).
      server.middlewares.stack.unshift({ route: '', handle: handler })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const rawBase = (env.VITE_GAMBAR_BASE || '').trim()
  const DEFAULT_CDN_GAMBAR = 'https://gambar.alutsmani.id'
  // Dev server: /gambar di-proxy ke lokal; build production: CDN bila VITE_GAMBAR_BASE kosong
  const GAMBAR_BASE =
    rawBase !== ''
      ? rawBase.replace(/\/$/, '')
      : command === 'serve'
        ? '/gambar'
        : DEFAULT_CDN_GAMBAR
  const rawAppBase = (env.VITE_APP_BASE || '').trim()
  const normalizedAppBase = rawAppBase.replace(/^\/+|\/+$/g, '')
  const APP_BASE = normalizedAppBase === '' ? '/' : `/${normalizedAppBase}/`
  const pwaDisabledInDev = command === 'serve' && (mode === 'development' || mode === 'https')
  const manifestStartUrl = APP_BASE === '/' ? '/' : APP_BASE
  const devHttps =
    command === 'serve' &&
    (mode === 'https' || env.VITE_DEV_HTTPS === '1' || env.VITE_DEV_HTTPS === 'true')

  return {
  base: APP_BASE,
  plugins: [
    ...(devHttps ? [basicSsl()] : []),
    ...(pwaDisabledInDev
      ? [
          manifestWebmanifestDevPlugin({ gambarBase: GAMBAR_BASE, startUrl: manifestStartUrl }),
          devServiceWorkerStubPlugin(),
        ]
      : []),
    react(),
    // Ganti path /gambar/ di index.html dengan VITE_GAMBAR_BASE agar icon/favicon tidak 404 di subdomain (uwaba2, dll.)
    {
      name: 'html-transform-gambar-base',
      transformIndexHtml(html) {
        return html
          .replace(/href="\/gambar\//g, `href="${GAMBAR_BASE}/`)
          .replace(/content="\/gambar\//g, `content="${GAMBAR_BASE}/`)
      }
    },
    VitePWA({
      // Di `vite` dev: matikan plugin (hindari sw virtual / manifest HTML / import di public/sw.js).
      // `vite preview` + `vite build` tetap pakai PWA penuh.
      disable: pwaDisabledInDev,
      registerType: 'autoUpdate',
      injectRegister: false, // Manual registration via serviceWorkerRegistration.js
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,ico,png,svg,jpg,jpeg,woff2}'],
        globIgnores: ['**/index.html'],
        // Vendor chunk bisa >2MB; naikkan limit precache agar tidak di-skip oleh Workbox.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      manifest: {
        name: 'eBeddien - Digital Service Center',
        short_name: 'eBeddien',
        description: 'eBeddien adalah Digital Service Center yang dirancang untuk memudahkan pengelolaan manajemen Pesantren Salafiyah Al-Utsmani. Aplikasi ini mendukung berbagai fitur pembayaran, pencatatan, serta pengelolaan keuangan yang terintegrasi.',
        theme_color: '#0d9488',
        background_color: '#D9F8F4',
        display: 'minimal-ui',
        scope: '/',
        start_url: '/',
        orientation: 'portrait',
        lang: 'id',
        dir: 'ltr',
        categories: ['finance', 'productivity', 'utilities'],
        icons: [
          { src: `${GAMBAR_BASE}/icon/ebeddienicon128.png`, sizes: '128x128', type: 'image/png', purpose: 'any' },
          { src: `${GAMBAR_BASE}/icon/ebeddienicon192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `${GAMBAR_BASE}/icon/ebeddienicon512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' }
        ],
        screenshots: [
          { src: `${GAMBAR_BASE}/ss/ebeddien (1).png`, sizes: '1080x1920', type: 'image/png' },
          { src: `${GAMBAR_BASE}/ss/ebeddien (2).png`, sizes: '1080x1920', type: 'image/png' },
          { src: `${GAMBAR_BASE}/ss/ebeddien (3).png`, sizes: '1080x1920', type: 'image/png' },
          { src: `${GAMBAR_BASE}/ss/ebeddien (4).png`, sizes: '1080x1920', type: 'image/png' },
          { src: `${GAMBAR_BASE}/ss/ebeddien (5).png`, sizes: '1080x1920', type: 'image/png' },
          { src: `${GAMBAR_BASE}/ss/ebeddienpc (1).png`, sizes: '1280x800', type: 'image/png', form_factor: 'wide' },
          { src: `${GAMBAR_BASE}/ss/ebeddienpc (2).png`, sizes: '1280x800', type: 'image/png', form_factor: 'wide' },
          { src: `${GAMBAR_BASE}/ss/ebeddienpc (3).png`, sizes: '1280x800', type: 'image/png', form_factor: 'wide' },
          { src: `${GAMBAR_BASE}/ss/ebeddienpc (4).png`, sizes: '1280x800', type: 'image/png', form_factor: 'wide' },
          { src: `${GAMBAR_BASE}/ss/ebeddienpc (5).png`, sizes: '1280x800', type: 'image/png', form_factor: 'wide' },
          { src: `${GAMBAR_BASE}/ss/ebeddienpc (6).png`, sizes: '1280x800', type: 'image/png', form_factor: 'wide' },
          { src: `${GAMBAR_BASE}/ss/ebeddienpc (7).png`, sizes: '1280x800', type: 'image/png', form_factor: 'wide' },
        ],
        shortcuts: [
          { name: 'Dashboard', short_name: 'Dashboard', description: 'Pantau Perkembangan Pembayaran', url: '/', icons: [{ src: `${GAMBAR_BASE}/icon/dashboard96.png`, sizes: '96x96', type: 'image/png' }] },
          { name: 'Pembayaran', short_name: 'Pembayaran', description: 'Lihat riwayat pembayaran', url: '/uwaba', icons: [{ src: `${GAMBAR_BASE}/icon/icon96.png`, sizes: '96x96', type: 'image/png' }] }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,ico,png,svg,jpg,jpeg,woff2}'],
        // Exclude index.html from precache - akan di-handle dengan NetworkFirst
        globIgnores: ['**/index.html'],
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          // HTML files - NetworkFirst untuk update cepat
          {
            urlPattern: /\/index\.html$/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 0 // No cache untuk HTML
              },
              networkTimeoutSeconds: 3
            }
          },
          {
            urlPattern: /\.html$/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 0 // No cache untuk HTML
              },
              networkTimeoutSeconds: 3
            }
          },
          // Assets (JS, CSS, images) - CacheFirst untuk performa
          {
            urlPattern: /\.(?:js|css|woff2?)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'assets-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /\/gambar\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'images-cache', expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 365 } }
          },
          {
            urlPattern: /^https:\/\/gambar\.alutsmani\.id\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'images-cache', expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 365 } }
          },
          // Google Fonts: tidak di-cache lewat SW (lihat public/sw.js) — selaras CSP style-src/font-src.

          // API - NetworkFirst
          {
            urlPattern: /\/backend\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5 // 5 minutes
              },
              networkTimeoutSeconds: 10
            }
          }
        ]
      },
      devOptions: {
        enabled: false,
      }
    })
  ],
  resolve: {
    // Satu instance React untuk seluruh app — mencegah "Invalid hook call" / useContext null pada chunk lazy (mis. DataPendaftar).
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  },
  server: {
    host: '0.0.0.0', // Allow access from network
    port: 5173,
    headers: {
      'Permissions-Policy': 'geolocation=(self), microphone=(), camera=(self)',
    },
    proxy: {
      /**
       * Dev: VITE_GAMBAR_BASE=/gambar tanpa folder `public/gambar` → semua img/getGambarUrl 404.
       * Proxy ke CDN production; berkas yang ada di `public/gambar/` tetap diprioritaskan Vite (layanan statis).
       */
      '/gambar': {
        target: 'http://localhost',
        changeOrigin: true,
        secure: false,
        bypass(req) {
          const pathname = (req.url || '').split('?')[0]
          if (!pathname.startsWith('/gambar/')) return undefined
          const rel = pathname.slice('/gambar/'.length).replace(/^\/+/, '')
          if (!rel) return undefined
          const full = path.join(process.cwd(), 'public', 'gambar', rel)
          try {
            if (fs.existsSync(full) && fs.statSync(full).isFile()) {
              return pathname
            }
          } catch {
            /* lanjut proxy */
          }
          return undefined
        }
      },
      '/backend': {
        target: 'http://localhost',
        changeOrigin: true
      },
      /** API Slim (XAMPP) — same-origin di dev agar HP HTTPS tidak mixed-content ke :80 */
      '/api': {
        target: 'http://localhost',
        changeOrigin: true,
        secure: false,
      },
      /** Presence/chat Socket.IO — sama origin dengan Vite (hindari CORS ke :3004) */
      '/live-socket': {
        target: 'http://127.0.0.1:3004',
        changeOrigin: true,
        ws: true,
        rewrite: (p) => p.replace(/^\/live-socket/, ''),
      },
      // Selain itu: /gambar dari `public/gambar/` bila folder diisi lokal
      '/manifest.json': {
        target: 'http://localhost',
        changeOrigin: true
      },
      '/print-uwaba.html': {
        target: 'http://localhost',
        changeOrigin: true
      }
    },
    fs: {
      allow: ['..']
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: mode === 'production' ? 'hidden' : true,
    emptyOutDir: true, // Kosongkan dist, file HTML akan di-copy otomatis dari public/
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Vendor chunks
          if (id.includes('node_modules')) {
            // JANGAN pisahkan React - biarkan di main bundle untuk menghindari masalah loading order
            // React core tetap di bundle utama untuk memastikan selalu tersedia
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              // Jangan return chunk name, biarkan di main bundle
              return undefined
            }
            // Animation library
            if (id.includes('framer-motion')) {
              return 'animation-vendor'
            }
            // Chart libraries
            if (id.includes('chart.js') || id.includes('react-chartjs-2')) {
              return 'chart-vendor'
            }
            // Excel library
            if (id.includes('xlsx')) {
              return 'xlsx-vendor'
            }
            // Markdown libraries
            if (id.includes('react-markdown') || id.includes('remark-')) {
              return 'markdown-vendor'
            }
            // HTTP client
            if (id.includes('axios')) {
              return 'axios-vendor'
            }
            // State management
            if (id.includes('zustand')) {
              return 'zustand-vendor'
            }
            // React Query
            if (id.includes('@tanstack/react-query')) {
              return 'query-vendor'
            }
            // Icons
            if (id.includes('@heroicons')) {
              return 'icons-vendor'
            }
            // Spreadsheet / editor heavy libs
            if (id.includes('@fortune-sheet/')) {
              return 'sheet-vendor'
            }
            if (id.includes('quill')) {
              return 'editor-vendor'
            }
            // Realtime / auth / storage utils
            if (id.includes('socket.io-client')) {
              return 'socket-vendor'
            }
            if (id.includes('@simplewebauthn/browser')) {
              return 'passkey-vendor'
            }
            if (id.includes('dexie')) {
              return 'storage-vendor'
            }
            if (id.includes('qrcode.react')) {
              return 'qrcode-vendor'
            }
            // Other node_modules
            return 'vendor'
          }
        }
      }
    },
    // Fortune Sheet memang besar dan sudah dipisah ke chunk sendiri.
    // Naikkan threshold agar warning fokus ke regresi baru yang signifikan.
    chunkSizeWarningLimit: 2000
  },
  publicDir: 'public'
  }
})

