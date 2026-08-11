/// <reference types="node" />
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function resolveGambarBase(env: Record<string, string>, mode: string): string {
  const raw = (env.VITE_GAMBAR_BASE || '').trim()
  if (raw !== '') return raw.replace(/\/$/, '')
  return mode === 'production' ? 'https://gambar.alutsmani.id' : '/gambar'
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const GAMBAR_BASE = resolveGambarBase(env, mode)

  /** Tiap build produksi unik → skrip inline membandingkan dengan localStorage dan membersihkan SW/cache jika deploy baru */
  const NM_BUILD_ID =
    mode === 'development'
      ? 'dev'
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`

  return {
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
      __NM_BUILD_ID__: JSON.stringify(NM_BUILD_ID),
    },
    plugins: [
      react(),
      {
        name: 'inject-nm-build-id-meta',
        transformIndexHtml(html) {
          const meta = `<meta name="nm-build-id" content="${NM_BUILD_ID}" />\n    `
          return html.replace(/<meta\s+charset="UTF-8"\s*\/?>\s*/i, (m) => `${m}${meta}`)
        },
      },
      {
        name: 'html-transform-gambar-base',
        transformIndexHtml(html) {
          return html
            .replace(/href="\/gambar\//g, `href="${GAMBAR_BASE}/`)
            .replace(/content="\/gambar\//g, `content="${GAMBAR_BASE}/`)
            .replace(/https:\/\/alutsmani\.id\/gambar\//g, `${GAMBAR_BASE}/`)
        },
      },
      {
        name: 'inject-sw-precache-bundles',
        closeBundle() {
          if (mode !== 'production') return
          const root = process.cwd()
          const htmlPath = resolve(root, 'dist/index.html')
          const swPath = resolve(root, 'dist/sw.js')
          if (!existsSync(htmlPath) || !existsSync(swPath)) return
          const html = readFileSync(htmlPath, 'utf8')
          const assets = new Set<string>()
          for (const m of html.matchAll(/\b(?:src|href)="(\/assets\/[^"]+)"/g)) {
            if (/\.(?:js|mjs|css)$/i.test(m[1])) assets.add(m[1])
          }
          const list = JSON.stringify([...assets])
          let sw = readFileSync(swPath, 'utf8')
          const marker = 'const PRECACHE_BUNDLES = [] // nm-precache-bundles'
          if (!sw.includes(marker)) return
          sw = sw.replace(marker, `const PRECACHE_BUNDLES = ${list} // nm-precache-bundles`)
          writeFileSync(swPath, sw)

          const manifestPath = resolve(root, 'dist/manifest.webmanifest')
          if (existsSync(manifestPath)) {
            let manifest = readFileSync(manifestPath, 'utf8')
            manifest = manifest.replace(/https:\/\/alutsmani\.id\/gambar\//g, `${GAMBAR_BASE}/`)
            const parsed = JSON.parse(manifest) as { display?: string }
            if (parsed.display !== 'minimal-ui') {
              throw new Error(
                `[build] manifest.webmanifest: display harus "minimal-ui", dapat: ${JSON.stringify(parsed.display)}`,
              )
            }
            writeFileSync(manifestPath, manifest)
          }
        },
      },
    ],
    server: {
      proxy: {
        '/gambar': {
          target: 'http://localhost',
          changeOrigin: true,
          secure: false,
        },
        '/api': {
          target: 'http://localhost/api/public',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})
