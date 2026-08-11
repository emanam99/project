/**
 * Catatan: integrasi @astrojs/sitemap otomatis menulis sitemap-index.xml & sitemap-0.xml ke /dist setelah build.
 * File ini disediakan untuk dev mode / fallback agar URL /sitemap-index.xml tidak 404 sebelum build.
 */
import type { APIRoute } from 'astro'

export const prerender = false

export const GET: APIRoute = async () => {
  const siteUrl = (import.meta.env.PUBLIC_SITE_URL || '').replace(/\/$/, '')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${siteUrl}/sitemap-0.xml</loc>
  </sitemap>
</sitemapindex>`
  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'application/xml; charset=utf-8' }
  })
}
