import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const rawBase = (env.VITE_GAMBAR_BASE || '').trim()
  const GAMBAR_BASE = rawBase !== '' ? rawBase.replace(/\/$/, '') : '/gambar'

  return {
  plugins: [
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
      registerType: 'autoUpdate',
      injectRegister: false, // Manual registration via serviceWorkerRegistration.js
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,ico,png,svg,jpg,jpeg,woff2}'],
        globIgnores: ['**/index.html'],
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
          { src: `${GAMBAR_BASE}/icon/ebeddienicon512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ],
        screenshots: [
          { src: `${GAMBAR_BASE}/ss/ss1.jpg`, sizes: '512x1024', type: 'image/jpeg' },
          { src: `${GAMBAR_BASE}/ss/ss2.jpg`, sizes: '512x1024', type: 'image/jpeg' },
          { src: `${GAMBAR_BASE}/ss/ss3.jpg`, sizes: '512x1024', type: 'image/jpeg' },
          { src: `${GAMBAR_BASE}/ss/ss4.jpg`, sizes: '512x1024', type: 'image/jpeg' },
          { src: `${GAMBAR_BASE}/ss/ss5.jpg`, sizes: '512x1024', type: 'image/jpeg' },
          { src: `${GAMBAR_BASE}/ss/ss6.jpg`, sizes: '512x1024', type: 'image/jpeg' },
          { src: `${GAMBAR_BASE}/ss/ss7.jpg`, sizes: '512x1024', type: 'image/jpeg' },
          { src: `${GAMBAR_BASE}/ss/ss8.jpg`, sizes: '512x1024', type: 'image/jpeg' }
        ],
        shortcuts: [
          { name: 'Dashboard', short_name: 'Dashboard', description: 'Pantau Perkembangan Pembayaran', url: '/', icons: [{ src: `${GAMBAR_BASE}/icon/dashboard.png`, sizes: '96x96', type: 'image/png' }] },
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
          // Fonts - CacheFirst
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
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
        enabled: true,
        type: 'module'
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    host: '0.0.0.0', // Allow access from network
    port: 5173,
    proxy: {
      '/backend': {
        target: 'http://localhost',
        changeOrigin: true
      },
      '/gambar': {
        target: 'http://localhost',
        changeOrigin: true
      },
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
            // Other node_modules
            return 'vendor'
          }
        }
      }
    },
    chunkSizeWarningLimit: 1000 // Increase limit to 1MB (default is 500KB) - ini adalah option Vite, bukan Rollup
  },
  publicDir: 'public'
  }
})

