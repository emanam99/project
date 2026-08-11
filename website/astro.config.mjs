// @ts-check
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import tailwind from '@astrojs/tailwind'
import sitemap from '@astrojs/sitemap'
import node from '@astrojs/node'
import AstroPWA from '@vite-pwa/astro'

const SITE_URL = process.env.PUBLIC_SITE_URL || 'http://localhost:4321'
const API_BASE = process.env.PUBLIC_API_BASE_URL || 'https://api.alutsmani.id'

/**
 * Sitemap diperkaya dengan slug berita & halaman publish dari API Slim
 * (build-time fetch). Aman jika API tidak tersedia: fallback ke daftar default.
 */
async function fetchCustomSitemapPages() {
  try {
    const res = await fetch(`${API_BASE}/api/public/website/sitemap`, {
      headers: { Accept: 'application/json' }
    })
    if (!res.ok) return []
    const json = await res.json()
    if (!json?.success) return []
    const pages = []
    for (const r of json.data?.berita || []) {
      if (r?.slug) pages.push(`${SITE_URL}/berita/${r.slug}`)
    }
    for (const r of json.data?.halaman || []) {
      if (r?.slug) pages.push(`${SITE_URL}/halaman/${r.slug}`)
    }
    for (const r of json.data?.kategori_berita || []) {
      if (r?.slug) pages.push(`${SITE_URL}/kategori/${r.slug}`)
    }
    return pages
  } catch (err) {
    console.warn('[sitemap] gagal fetch dari API:', err?.message || err)
    return []
  }
}

const customPages = await fetchCustomSitemapPages()

export default defineConfig({
  site: SITE_URL,
  // Astro 5: "hybrid" dihapus; "static" + adapter Node mendukung halaman SSR lewat `prerender = false`.
  output: 'static',
  adapter: node({ mode: 'standalone' }),
  integrations: [
    react(),
    tailwind({ applyBaseStyles: true }),
    sitemap({ customPages }),
    AstroPWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Pesantren',
        short_name: 'Pesantren',
        description: 'Website resmi Pondok Pesantren',
        start_url: '/',
        display: 'standalone',
        theme_color: '#0f766e',
        background_color: '#0b1120',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        navigateFallback: '/',
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,jpeg,webp,ico,woff2}']
      },
      devOptions: { enabled: false }
    })
  ],
  server: {
    host: true,
    port: 4321
  }
})
