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
      name: 'Kasly',
      builtAt,
    },
    null,
    2,
  )

  return {
    name: 'kasly-version-json',
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
        : '/kasly/gambar'

  const appBase = command === 'serve' ? '/' : env.VITE_APP_BASE?.trim() || '/kasly/app/'
  const normalizedBase = appBase.endsWith('/') ? appBase : `${appBase}/`
  const startUrl = normalizedBase === '/' ? '/' : normalizedBase
  const gambarRoot = join(process.cwd(), '..', 'gambar')

  const ssHp = sizeLabel(join(gambarRoot, 'ss', 'ss-hp-1.png'), '1080x1920')
  const ssPc = sizeLabel(join(gambarRoot, 'ss', 'ss-pc-1.png'), '1280x800')

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
          id: 'kasly-rumah',
          name: 'Kasly',
          short_name: 'Kasly',
          description: 'Kasly — catatan belanja rumah',
          theme_color: '#db2777',
          background_color: '#14080e',
          display: 'minimal-ui',
          scope: startUrl,
          start_url: startUrl,
          orientation: 'any',
          lang: 'id',
          dir: 'ltr',
          categories: ['finance', 'productivity'],
          icons: [
            {
              src: `${GAMBAR_BASE}/icon/kasly192.png`,
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: `${GAMBAR_BASE}/icon/kasly512.png`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: `${GAMBAR_BASE}/icon/kasly.png`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: `${GAMBAR_BASE}/icon/kasly32.png`,
              sizes: '32x32',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: `${GAMBAR_BASE}/icon/kasly64.png`,
              sizes: '64x64',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: `${GAMBAR_BASE}/icon/kasly96.png`,
              sizes: '96x96',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: `${GAMBAR_BASE}/icon/kasly128.png`,
              sizes: '128x128',
              type: 'image/png',
              purpose: 'any',
            },
          ],
          screenshots: [
            {
              src: `${GAMBAR_BASE}/ss/ss-hp-1.png`,
              sizes: ssHp,
              type: 'image/png',
              form_factor: 'narrow',
              label: 'Kasly di HP',
            },
            {
              src: `${GAMBAR_BASE}/ss/ss-hp-2.png`,
              sizes: ssHp,
              type: 'image/png',
              form_factor: 'narrow',
              label: 'Catatan belanja',
            },
            {
              src: `${GAMBAR_BASE}/ss/ss-hp-3.png`,
              sizes: ssHp,
              type: 'image/png',
              form_factor: 'narrow',
              label: 'Rekening',
            },
            {
              src: `${GAMBAR_BASE}/ss/ss-hp-4.png`,
              sizes: ssHp,
              type: 'image/png',
              form_factor: 'narrow',
              label: 'Pengaturan',
            },
            {
              src: `${GAMBAR_BASE}/ss/ss-pc-1.png`,
              sizes: ssPc,
              type: 'image/png',
              form_factor: 'wide',
              label: 'Kasly di PC',
            },
            {
              src: `${GAMBAR_BASE}/ss/ss-pc-2.png`,
              sizes: ssPc,
              type: 'image/png',
              form_factor: 'wide',
              label: 'Catatan belanja PC',
            },
            {
              src: `${GAMBAR_BASE}/ss/ss-pc-3.png`,
              sizes: ssPc,
              type: 'image/png',
              form_factor: 'wide',
              label: 'Rekening PC',
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
      port: 5178,
      strictPort: true,
      proxy: {
        '/gambar': {
          target: 'http://127.0.0.1',
          changeOrigin: true,
          rewrite: (path) => `/kasly${path}`,
        },
      },
    },
  }
})
