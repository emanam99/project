import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const rawBase = (env.VITE_GAMBAR_BASE || '').trim()
  const DEFAULT_GAMBAR_BASE = 'https://alutsmani.id/gambar'
  const normalizeGambarBase = (base) => {
    const trimmed = (base || '').trim().replace(/\/$/, '')
    if (!trimmed) return DEFAULT_GAMBAR_BASE
    if (trimmed === '/gambar' || trimmed === 'gambar') return DEFAULT_GAMBAR_BASE
    if (trimmed.startsWith('/gambar/')) return `${DEFAULT_GAMBAR_BASE}${trimmed.slice('/gambar'.length)}`
    return trimmed
  }
  const GAMBAR_BASE = normalizeGambarBase(rawBase)
  const isDev = mode === 'development'

  return {
    plugins: [
      react(),
      // Ganti path /gambar/ di index.html dengan VITE_GAMBAR_BASE (sama seperti uwaba)
      {
        name: 'html-transform-gambar-base',
        transformIndexHtml(html) {
          return html
            .replace(/href="\/gambar\//g, `href="${GAMBAR_BASE}/`)
            .replace(/content="\/gambar\//g, `content="${GAMBAR_BASE}/`)
        },
      },
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: false,
        manifest: {
          id: '/',
          name: 'myBeddien',
          short_name: 'myBeddien',
          description: 'Aplikasi santri - biodata, riwayat pembayaran, profil',
          start_url: '/',
          display: 'minimal-ui',
          background_color: '#f0f9ff',
          theme_color: '#0284c7',
          lang: 'id',
          scope: '/',
          orientation: 'portrait-primary',
          icons: [
            { src: `${GAMBAR_BASE}/icon/mybeddien128.png`, sizes: '128x128', type: 'image/png', purpose: 'any' },
            { src: `${GAMBAR_BASE}/icon/mybeddien192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: `${GAMBAR_BASE}/icon/mybeddien512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: `${GAMBAR_BASE}/icon/mybeddien192.png`, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: `${GAMBAR_BASE}/icon/mybeddien512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          screenshots: [
            { src: `${GAMBAR_BASE}/ss/narrow.png`, sizes: '540x720', type: 'image/png', form_factor: 'narrow', label: 'myBeddien - Mobile' },
            { src: `${GAMBAR_BASE}/ss/wide.png`, sizes: '1280x720', type: 'image/png', form_factor: 'wide', label: 'myBeddien - Desktop' },
          ],
        },
        manifestFilename: 'manifest.webmanifest',
        workbox: {
          // Dev: folder dev-dist hanya berisi sw.js + workbox (di-globIgnore) → tanpa glob = hilangkan warning Workbox
          globPatterns: isDev ? [] : ['**/*.{js,css,html,ico,png,svg,woff2}'],
          skipWaiting: true,
          clientsClaim: true,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/.*\/api\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
                networkTimeoutSeconds: 10,
              },
            },
          ],
        },
        devOptions: { enabled: true },
      }),
    ],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
      host: '0.0.0.0',
      port: 5174,
      proxy: {
        '/api': {
          target: 'http://localhost',
          changeOrigin: true,
        },
        '/gambar': {
          target: 'http://localhost',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (id.includes('node_modules')) {
              if (id.includes('framer-motion')) return 'animation'
              if (id.includes('axios')) return 'axios'
              if (id.includes('react-router')) return 'router'
              if (id.includes('zustand')) return 'zustand'
              return 'vendor'
            }
          },
        },
      },
    },
  }
})
