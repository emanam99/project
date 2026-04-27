/// <reference types="node" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const rawBase = (env.VITE_GAMBAR_BASE || '').trim()
  const GAMBAR_BASE = rawBase !== '' ? rawBase.replace(/\/$/, '') : '/gambar'

  return {
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
    },
    plugins: [
      react(),
      {
        name: 'html-transform-gambar-base',
        transformIndexHtml(html) {
          return html
            .replace(/href="\/gambar\//g, `href="${GAMBAR_BASE}/`)
            .replace(/content="\/gambar\//g, `content="${GAMBAR_BASE}/`)
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
