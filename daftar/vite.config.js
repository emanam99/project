import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const rawBase = (env.VITE_GAMBAR_BASE || '').trim()
  const GAMBAR_BASE = rawBase !== '' ? rawBase.replace(/\/$/, '') : '/gambar'

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
      }
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5175,
    proxy: {
      '/backend': {
        target: 'http://localhost',
        changeOrigin: true
      },
      '/gambar': {
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
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return undefined
            }
            if (id.includes('framer-motion')) {
              return 'animation-vendor'
            }
            if (id.includes('chart.js') || id.includes('react-chartjs-2')) {
              return 'chart-vendor'
            }
            if (id.includes('xlsx')) {
              return 'xlsx-vendor'
            }
            if (id.includes('react-markdown') || id.includes('remark-')) {
              return 'markdown-vendor'
            }
            if (id.includes('axios')) {
              return 'axios-vendor'
            }
            if (id.includes('zustand')) {
              return 'zustand-vendor'
            }
            if (id.includes('@tanstack/react-query')) {
              return 'query-vendor'
            }
            if (id.includes('@heroicons')) {
              return 'icons-vendor'
            }
            return 'vendor'
          }
        }
      }
    },
    chunkSizeWarningLimit: 1000
  },
  publicDir: 'public'
  }
})
