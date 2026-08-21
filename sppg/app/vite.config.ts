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

/** Sinkronkan public/version.json + dist/version.json dengan APP_VERSION. */
function versionJsonPlugin(): Plugin {
  // builtAt tetap per sesi build agar tidak dobel hash di tengah proses
  const builtAt = new Date().toISOString()
  const payload = JSON.stringify(
    {
      version: APP_VERSION,
      name: 'SPPG',
      builtAt,
    },
    null,
    2,
  )

  return {
    name: 'sppg-version-json',
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
        : '/sppg/gambar'

  const appBase = command === 'serve' ? '/' : env.VITE_APP_BASE?.trim() || '/sppg/app/'
  const normalizedBase = appBase.endsWith('/') ? appBase : `${appBase}/`
  const startUrl = normalizedBase === '/' ? '/' : normalizedBase
  const gambarRoot = join(process.cwd(), '..', 'gambar')

  const icon = (name: string, fallback: string) =>
    sizeLabel(join(gambarRoot, 'icon', name), fallback)
  const ss1 = sizeLabel(join(gambarRoot, 'ss', 'ss1.png'), '1080x1920')
  const ss2 = sizeLabel(join(gambarRoot, 'ss', 'ss2.png'), '1080x1920')
  const ss3 = sizeLabel(join(gambarRoot, 'ss', 'ss3.png'), '1080x1920')
  const ssWide = sizeLabel(join(gambarRoot, 'ss', 'ss-wide.png'), '1920x1080')
  const icon32 = icon('sppg.v3.u32.png', '32x32')
  const icon64 = icon('sppg.v3.u64.png', '64x64')
  const icon96 = icon('sppg.v3.u96.png', '96x96')
  const icon128 = icon('sppg.v3.u128.png', '128x128')
  const icon192 = icon('sppg.v3.u192.png', '192x192')
  const icon512 = icon('sppg.v3.u512.png', '512x512')
  /** Query baru = URL ikon baru → OS/browser lebih mungkin refresh ikon home screen. */
  const iconV = `?v=${encodeURIComponent(APP_VERSION)}`

  return {
    base: command === 'serve' ? '/' : normalizedBase,
    define: {
      __APP_VERSION__: JSON.stringify(APP_VERSION),
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
        // version.json sengaja tidak di-precache (dicek via NetworkFirst untuk deteksi update)
        includeAssets: [],
        injectManifest: {
          globPatterns: ['**/*.{js,css,ico,png,svg,jpg,jpeg,woff2,webmanifest}'],
          globIgnores: ['**/index.html', '**/version.json'],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        },
        manifest: {
          id: 'sppg-alutsmani',
          name: 'SPPG',
          short_name: 'SPPG',
          description: 'SPPG — catatan belanja dapur santri',
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
              src: `${GAMBAR_BASE}/icon/sppg.v3.u32.png${iconV}`,
              sizes: icon32,
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: `${GAMBAR_BASE}/icon/sppg.v3.u64.png${iconV}`,
              sizes: icon64,
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: `${GAMBAR_BASE}/icon/sppg.v3.u96.png${iconV}`,
              sizes: icon96,
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: `${GAMBAR_BASE}/icon/sppg.v3.u128.png${iconV}`,
              sizes: icon128,
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: `${GAMBAR_BASE}/icon/sppg.v3.u192.png${iconV}`,
              sizes: icon192,
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: `${GAMBAR_BASE}/icon/sppg.v3.u512.png${iconV}`,
              sizes: icon512,
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: `${GAMBAR_BASE}/icon/sppg.v3.u512.png${iconV}`,
              sizes: icon512,
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
          screenshots: [
            {
              src: `${GAMBAR_BASE}/ss/ss1.png`,
              sizes: ss1,
              type: 'image/png',
              form_factor: 'narrow',
              label: 'Catatan belanja',
            },
            {
              src: `${GAMBAR_BASE}/ss/ss2.png`,
              sizes: ss2,
              type: 'image/png',
              form_factor: 'narrow',
              label: 'Pengaturan',
            },
            {
              src: `${GAMBAR_BASE}/ss/ss3.png`,
              sizes: ss3,
              type: 'image/png',
              form_factor: 'narrow',
              label: 'SPPG',
            },
            {
              src: `${GAMBAR_BASE}/ss/ss-wide.png`,
              sizes: ssWide,
              type: 'image/png',
              form_factor: 'wide',
              label: 'Catatan belanja (desktop)',
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
      host: true,
      port: 5177,
      strictPort: true,
      proxy: {
        '/gambar': {
          target: 'http://127.0.0.1',
          changeOrigin: true,
          rewrite: (path) => `/sppg${path}`,
        },
        '/sppg/api': {
          target: 'http://127.0.0.1',
          changeOrigin: true,
        },
      },
    },
  }
})
