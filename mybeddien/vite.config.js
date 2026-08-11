import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import fs from 'fs'
import { APP_VERSION } from './src/config/version.js'

/** Saat build: file kecil di dist berisi APP_VERSION — di-poll klien untuk deteksi deploy & auto-reload. */
function pwaReleaseAssetPlugin(appVersion) {
  return {
    name: 'pwa-release-asset',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'pwa-release.txt',
        source: `${appVersion}\n`,
      })
    },
  }
}

function parseEnvFile(filePath) {
  const out = {}
  try {
    const text = fs.readFileSync(filePath, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim()
      if (t === '' || t.startsWith('#') || !t.includes('=')) continue
      const i = t.indexOf('=')
      const k = t.slice(0, i).trim()
      let v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
      out[k] = v
    }
  } catch {
    /* abaikan */
  }
  return out
}

/** Selaras manifest dev & production (splash / tampilan terpasang). */
const PWA_DISPLAY = 'minimal-ui'
const PWA_THEME_COLOR = '#1761ac'
const PWA_BACKGROUND_COLOR = '#0d1323'

/** Dev: manifest valid tanpa plugin PWA penuh (selaras eBeddien). */
function manifestWebmanifestDevPlugin({ gambarBase }) {
  const manifestBody = JSON.stringify({
    id: '/',
    name: 'myBeddien',
    short_name: 'myBeddien',
    description:
      'Aplikasi santri & PJGT Al-Utsmani: biodata, riwayat pembayaran, laporan, profil — online maupun terpasang sebagai aplikasi.',
    start_url: '/',
    scope: '/',
    display: PWA_DISPLAY,
    theme_color: PWA_THEME_COLOR,
    background_color: PWA_BACKGROUND_COLOR,
    lang: 'id',
    dir: 'ltr',
    categories: ['education', 'lifestyle'],
    orientation: 'any',
    launch_handler: { client_mode: 'navigate-existing' },
    icons: [
      { src: `${gambarBase}/icon/mybeddienicon192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
    ],
    screenshots: buildMybeddienPwaScreenshots(gambarBase),
    shortcuts: buildMybeddienPwaShortcuts(gambarBase),
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

/** Dev: stub /sw.js agar SW lama tidak cache modul Vite (axios ?v=… 504 Outdated Optimize Dep). */
function devServiceWorkerStubPlugin() {
  const stub = `/* vite dev — stub; production pakai sw.js hasil build */
self.addEventListener('install', (e) => { e.waitUntil(self.skipWaiting()) })
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()) })
`
  return {
    name: 'dev-sw-stub',
    enforce: 'pre',
    configureServer(server) {
      const handler = (req, res, next) => {
        const raw = req.url?.split('?')[0] || ''
        if (raw !== '/sw.js') return next()
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(stub)
      }
      server.middlewares.stack.unshift({ route: '', handle: handler })
    },
  }
}

/** Dev + build HTML: izin kamera untuk Scan QR (Vite dev tidak pakai .htaccess Apache). */
const PERMISSIONS_POLICY_VALUE = 'geolocation=(), microphone=(), camera=(self)'
const PERMISSIONS_POLICY_META = `<meta http-equiv="Permissions-Policy" content="${PERMISSIONS_POLICY_VALUE}" />`

function permissionsPolicyPlugin() {
  return {
    name: 'permissions-policy-camera-self',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        res.setHeader('Permissions-Policy', PERMISSIONS_POLICY_VALUE)
        next()
      })
    },
    transformIndexHtml(html) {
      if (/Permissions-Policy/i.test(html)) return html
      return html.replace(/<meta name="viewport"[^>]*\/?>/i, (m) => `${m}\n    ${PERMISSIONS_POLICY_META}`)
    },
  }
}

/** Cegah browser/SW cache pre-bundle Vite di dev. */
function viteDepsDevHeadersPlugin() {
  return {
    name: 'vite-deps-dev-headers',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || ''
        if (url.includes('/node_modules/.vite/deps/') || url.startsWith('/@vite/') || url.startsWith('/@id/')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
          res.setHeader('Pragma', 'no-cache')
        }
        next()
      })
    },
  }
}

/** Port & kunci WA dari api/.env + wa/.env (selaras eBeddien / PHP, hindari hardcode 3001). */
function readWaNodeDevConfig() {
  const apiEnv = parseEnvFile(path.resolve(__dirname, '../api/.env'))
  const waEnv = parseEnvFile(path.resolve(__dirname, '../wa/.env'))
  let port = '3001'
  const waApiUrl = apiEnv.WA_API_URL || ''
  const portFromUrl = waApiUrl.match(/:(\d+)\//)
  if (portFromUrl) {
    port = portFromUrl[1]
  } else if (waEnv.PORT) {
    port = String(waEnv.PORT).replace(/\D/g, '') || port
  }
  const apiKey = (apiEnv.WA_API_KEY || waEnv.WA_API_KEY || '').trim()
  return { port, apiKey }
}

/** URL file di gambar/ss (nama berisi spasi → encode utk manifest / og:image). */
function gambarSsUrl(gambarBase, filename) {
  const base = String(gambarBase || '').replace(/\/$/, '')
  return `${base}${encodeURI(`/ss/${filename}`)}`
}

/**
 * Screenshot khusus myBeddien (ponsel) & myBeddien PC — file di htdocs/gambar/ss.
 * Ukuran disesuaikan lebar×tinggi aktual file PNG.
 */
function buildMybeddienPwaScreenshots(gambarBase) {
  const narrow = [
    ['mybeddien (1).png', '1080x1920', 'myBeddien — beranda & navigasi (ponsel)'],
    ['mybeddien (2).png', '1080x1920', 'myBeddien — biodata & layanan santri'],
    ['mybeddien (3).png', '1080x1920', 'myBeddien — riwayat & pembayaran'],
    ['mybeddien (4).png', '1080x1920', 'myBeddien — fitur tambahan (ponsel)'],
  ]
  const wide = [
    ['mybeddien-pc (1).png', '1280x800', 'myBeddien — tampilan desktop'],
    ['mybeddien-pc (2).png', '1280x800', 'myBeddien — desktop (varian)'],
    ['mybeddien-pc (3).png', '1280x800', 'myBeddien — desktop (layar lebar)'],
  ]
  const out = []
  for (const [file, sizes, label] of narrow) {
    out.push({
      src: gambarSsUrl(gambarBase, file),
      sizes,
      type: 'image/png',
      form_factor: 'narrow',
      label,
    })
  }
  for (const [file, sizes, label] of wide) {
    out.push({
      src: gambarSsUrl(gambarBase, file),
      sizes,
      type: 'image/png',
      form_factor: 'wide',
      label,
    })
  }
  return out
}

function mybeddienPwaShortcutIcon(gambarBase) {
  return `${String(gambarBase || '').replace(/\/$/, '')}/icon/mybeddienicon192.png`
}

function buildMybeddienPwaShortcuts(gambarBase) {
  const icon = mybeddienPwaShortcutIcon(gambarBase)
  const iconEntry = [{ src: icon, sizes: '192x192', type: 'image/png' }]
  return [
    {
      name: 'Beranda',
      short_name: 'Beranda',
      description: 'Ringkasan workspace myBeddien',
      url: '/',
      icons: iconEntry,
    },
    {
      name: 'Profil',
      short_name: 'Profil',
      description: 'Profil akun & pengaturan',
      url: '/profil',
      icons: iconEntry,
    },
    {
      name: 'Riwayat pembayaran',
      short_name: 'Bayar',
      description: 'UWABA, khusus, tunggakan',
      url: '/santri/riwayat-pembayaran',
      icons: iconEntry,
    },
  ]
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const pwaDisabledInDev = command === 'serve' && mode === 'development'
  const rawBase = (env.VITE_GAMBAR_BASE || '').trim()
  const DEFAULT_REMOTE_GAMBAR = 'https://gambar.alutsmani.id'

  /**
   * Base URL gambar untuk manifest PWA & transform index.html.
   * Path `/gambar` hanya untuk dev (proxy Apache). Build production selalu CDN agar:
   * - manifest pakai URL absolut (bukan /gambar/…)
   * - vite-plugin-pwa tidak menyalin/membuat folder gambar|icon|ss di dist
   */
  const resolveGambarBaseForConfig = () => {
    if (rawBase.startsWith('http://') || rawBase.startsWith('https://')) {
      return rawBase.replace(/\/$/, '')
    }
    if (mode === 'production') {
      return DEFAULT_REMOTE_GAMBAR
    }
    if (rawBase) {
      return rawBase.replace(/\/$/, '')
    }
    return '/gambar'
  }
  const GAMBAR_BASE = resolveGambarBaseForConfig()
  const isDev = mode === 'development'
  const waDevCfg = isDev ? readWaNodeDevConfig() : { port: '3001', apiKey: '' }
  const waNodePort =
    String(env.VITE_WA_BACKEND_PORT || waDevCfg.port || '3001').replace(/\D/g, '') || waDevCfg.port || '3001'
  const waApiKeyDev = waDevCfg.apiKey

  return {
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(APP_VERSION),
    },
    plugins: [
      permissionsPolicyPlugin(),
      ...(!pwaDisabledInDev ? [pwaReleaseAssetPlugin(APP_VERSION)] : []),
      ...(pwaDisabledInDev
        ? [
            manifestWebmanifestDevPlugin({ gambarBase: GAMBAR_BASE }),
            devServiceWorkerStubPlugin(),
            viteDepsDevHeadersPlugin(),
          ]
        : []),
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
        // Dev: matikan PWA penuh — hindari SW cache deps Vite (504 Outdated Optimize Dep pada axios.js?v=…).
        disable: pwaDisabledInDev,
        registerType: 'autoUpdate',
        injectRegister: false,
        strategies: 'injectManifest',
        srcDir: 'public',
        filename: 'sw.js',
        injectManifest: {
          globPatterns: ['**/*.{js,css,ico,png,svg,woff2}'],
          globIgnores: ['**/index.html', '**/sw.js'],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        },
        // Ikon/screenshot di CDN (gambar.alutsmani.id), bukan di public/ — jangan salin ke dist
        includeManifestIcons: false,
        manifest: {
          id: '/',
          name: 'myBeddien',
          short_name: 'myBeddien',
          description:
            'Aplikasi santri & PJGT Al-Utsmani: biodata, riwayat pembayaran, laporan guru tugas, toko, profil — bisa dipasang seperti aplikasi native.',
          start_url: '/',
          display: PWA_DISPLAY,
          background_color: PWA_BACKGROUND_COLOR,
          theme_color: PWA_THEME_COLOR,
          lang: 'id',
          dir: 'ltr',
          categories: ['education', 'lifestyle'],
          scope: '/',
          orientation: 'any',
          launch_handler: { client_mode: 'navigate-existing' },
          icons: [
            { src: `${GAMBAR_BASE}/icon/mybeddienicon128.png`, sizes: '128x128', type: 'image/png', purpose: 'any' },
            { src: `${GAMBAR_BASE}/icon/mybeddienicon192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: `${GAMBAR_BASE}/icon/mybeddienicon512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: `${GAMBAR_BASE}/icon/mybeddienicon192.png`, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: `${GAMBAR_BASE}/icon/mybeddienicon512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          screenshots: buildMybeddienPwaScreenshots(GAMBAR_BASE),
          shortcuts: buildMybeddienPwaShortcuts(GAMBAR_BASE),
        },
        manifestFilename: 'manifest.webmanifest',
        devOptions: { enabled: false },
      }),
    ],
    resolve: {
      // Satu instance React — cegah "Invalid hook call" / useSyncExternalStore null (mis. setelah @zxing/browser).
      dedupe: ['react', 'react-dom'],
      alias: {
        '@': path.resolve(__dirname, './src'),
        react: path.resolve(__dirname, 'node_modules/react'),
        'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      },
    },
    optimizeDeps: {
      entries: ['src/main.jsx', 'src/pages/Daftar.jsx', 'src/components/Auth/DaftarPjgtQrScannerOffcanvas.jsx'],
      include: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'axios',
        'react-router-dom',
        'zustand',
        'framer-motion',
        '@zxing/browser',
        '@zxing/library',
      ],
      // Kurangi race HMR vs pre-bundle baru setelah ubah vite.config / package.json
      holdUntilCrawlEnd: true,
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
        // Fallback dev: cek nomor langsung ke wa/ + X-API-Key dari api/.env (halaman daftar tanpa login)
        '/wa-node': {
          target: `http://127.0.0.1:${waNodePort}`,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/wa-node/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (waApiKeyDev) {
                proxyReq.setHeader('X-API-Key', waApiKeyDev)
              }
            })
          },
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: mode === 'production' ? 'hidden' : true,
      // Vendor/app chunk sering >500 kB; limit default hanya mengganggu log.
      // Pecah agresif React dihindari (lihat manualChunks) — naikkan batas saja.
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (id.includes('node_modules')) {
              // React tetap di bundle utama — hindari dua salinan React di chunk terpisah
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
                return undefined
              }
              if (id.includes('framer-motion')) return 'animation'
              if (id.includes('@zxing')) return 'qr-scanner'
              if (id.includes('@simplewebauthn/browser')) return 'passkey-vendor'
              if (id.includes('axios')) return 'axios'
              if (id.includes('zustand')) return 'zustand'
              return 'vendor'
            }
          },
        },
      },
    },
  }
})
