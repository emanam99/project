import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { APP_VERSION } from './src/config/version'

function readPngSize(filePath: string): { width: number; height: number } | null {
  try {
    const buf = readFileSync(filePath)
    if (buf.length < 24) return null
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  } catch {
    return null
  }
}

function sizeLabel(filePath: string, fallback: string): string {
  const s = readPngSize(filePath)
  return s ? `${s.width}x${s.height}` : fallback
}

function versionJsonPlugin(): Plugin {
  const builtAt = new Date().toISOString()
  const payload = JSON.stringify(
    {
      version: APP_VERSION,
      name: 'Wifi',
      builtAt,
    },
    null,
    2,
  )

  return {
    name: 'wifi-version-json',
    buildStart() {
      writeFileSync(join(process.cwd(), 'public', 'version.json'), `${payload}\n`, 'utf8')
    },
    closeBundle() {
      const dir = join(process.cwd(), 'dist')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'version.json'), `${payload}\n`, 'utf8')
    },
  }
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const rawGambar = (env.VITE_GAMBAR_BASE || '').trim()

  const GAMBAR_BASE =
    rawGambar !== ''
      ? rawGambar.replace(/\/$/, '')
      : command === 'serve'
        ? '/gambar'
        : '/wifi/gambar'

  const appBase = command === 'serve' ? '/' : env.VITE_APP_BASE?.trim() || '/wifi/app/'
  const normalizedBase = appBase.endsWith('/') ? appBase : `${appBase}/`
  const startUrl = normalizedBase === '/' ? '/' : normalizedBase
  const gambarRoot = join(process.cwd(), '..', 'gambar')

  const icon = (name: string, fallback: string) =>
    sizeLabel(join(gambarRoot, 'icon', name), fallback)
  const ssHp = (n: number) => sizeLabel(join(gambarRoot, 'ss', `ss${n}.png`), '1080x1920')
  const ssPc = (n: number) => sizeLabel(join(gambarRoot, 'ss', `ss-pc${n}.png`), '1280x800')
  const icon32 = icon('connect32.png', '32x32')
  const icon64 = icon('connect64.png', '64x64')
  const icon96 = icon('connect96.png', '96x96')
  const icon128 = icon('connect128.png', '128x128')
  const icon192 = icon('connect192.png', '192x192')
  const icon512 = icon('connect512.png', '512x512')
  const iconV = `?v=${encodeURIComponent(APP_VERSION)}`

  const hpLabels = ['Dashboard', 'Tagihan', 'Pelanggan', 'Rekap', 'Pengaturan']
  const pcLabels = ['Dashboard (desktop)', 'Tagihan (desktop)']
  const screenshotHp = [1, 2, 3, 4, 5].map((n) => ({
    src: `${GAMBAR_BASE}/ss/ss${n}.png${iconV}`,
    sizes: ssHp(n),
    type: 'image/png' as const,
    form_factor: 'narrow' as const,
    label: hpLabels[n - 1] ?? `Wifi HP ${n}`,
  }))
  const screenshotPc = [1, 2].map((n) => ({
    src: `${GAMBAR_BASE}/ss/ss-pc${n}.png${iconV}`,
    sizes: ssPc(n),
    type: 'image/png' as const,
    form_factor: 'wide' as const,
    label: pcLabels[n - 1] ?? `Wifi PC ${n}`,
  }))

  return {
    base: command === 'serve' ? '/' : normalizedBase,
    define: {
      __APP_VERSION__: JSON.stringify(APP_VERSION),
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) {
              return 'charts'
            }
            if (id.includes('framer-motion')) {
              return 'motion'
            }
            if (id.includes('xlsx')) {
              return 'xlsx'
            }
            if (
              id.includes('react-router') ||
              id.includes('react-dom') ||
              id.includes('scheduler') ||
              /[\\/]node_modules[\\/]react[\\/]/.test(id)
            ) {
              return 'react-vendor'
            }
          },
        },
      },
    },
    plugins: [
      react(),
      {
        name: 'html-transform-gambar-base',
        transformIndexHtml(html: string) {
          return html
            .replace(/href="\/gambar\//g, `href="${GAMBAR_BASE}/`)
            .replace(/content="\/gambar\//g, `content="${GAMBAR_BASE}/`)
            .replace(/__APP_VERSION__/g, APP_VERSION)
        },
      },
      versionJsonPlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: false,
        strategies: 'injectManifest',
        srcDir: 'public',
        filename: 'sw.js',
        includeAssets: [],
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,woff2,webmanifest}'],
          globIgnores: ['**/version.json'],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        },
        manifest: {
          id: 'wifi-alutsmani',
          name: 'Wifi',
          short_name: 'Wifi',
          description: 'Wifi — tagihan pelanggan',
          theme_color: '#2a96e0',
          background_color: '#2a96e0',
          display: 'minimal-ui',
          scope: startUrl,
          start_url: startUrl,
          orientation: 'portrait',
          lang: 'id',
          dir: 'ltr',
          categories: ['finance', 'productivity'],
          icons: [
            {
              src: `${GAMBAR_BASE}/icon/connect32.png${iconV}`,
              sizes: icon32,
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: `${GAMBAR_BASE}/icon/connect64.png${iconV}`,
              sizes: icon64,
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: `${GAMBAR_BASE}/icon/connect96.png${iconV}`,
              sizes: icon96,
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: `${GAMBAR_BASE}/icon/connect128.png${iconV}`,
              sizes: icon128,
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: `${GAMBAR_BASE}/icon/connect192.png${iconV}`,
              sizes: icon192,
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: `${GAMBAR_BASE}/icon/connect512.png${iconV}`,
              sizes: icon512,
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: `${GAMBAR_BASE}/icon/connect512.png${iconV}`,
              sizes: icon512,
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
          screenshots: [...screenshotHp, ...screenshotPc],
        },
        devOptions: {
          enabled: true,
          type: 'module',
          navigateFallback: 'index.html',
        },
      }),
    ],
    server: {
      host: true,
      port: 5178,
      strictPort: true,
      proxy: {
        '/gambar': {
          target: 'http://127.0.0.1',
          changeOrigin: true,
          rewrite: (path) => `/wifi${path}`,
        },
        '/wifi/api': {
          target: 'http://127.0.0.1',
          changeOrigin: true,
        },
      },
    },
  }
})
