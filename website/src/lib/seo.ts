/** Builder metadata SEO. Default ke pengaturan global API saat field kosong. */
import type { SeoGlobal } from './api'

export interface BuiltSeo {
  title: string
  description: string
  ogTitle: string
  ogDescription: string
  ogImage: string
  canonical: string
  type: 'website' | 'article'
  publishedTime?: string
  twitterHandle?: string
}

export function buildSeo(opts: {
  global: SeoGlobal | null
  pageTitle?: string | null
  pageDescription?: string | null
  pageOgTitle?: string | null
  pageOgDescription?: string | null
  pageOgImage?: string | null
  canonical: string
  type?: 'website' | 'article'
  publishedTime?: string | null
}): BuiltSeo {
  const g = opts.global || {}
  const siteTitle = g.site_title || 'Pesantren'
  const siteDesc = g.site_description || 'Website resmi Pondok Pesantren'

  const title = opts.pageTitle ? `${opts.pageTitle} — ${siteTitle}` : siteTitle
  const description = opts.pageDescription || siteDesc
  const ogTitle = opts.pageOgTitle || opts.pageTitle || g.og_default_title || siteTitle
  const ogDescription =
    opts.pageOgDescription || opts.pageDescription || g.og_default_description || siteDesc
  const ogImage = opts.pageOgImage || g.og_default_image || ''

  return {
    title,
    description,
    ogTitle,
    ogDescription,
    ogImage,
    canonical: opts.canonical,
    type: opts.type || 'website',
    publishedTime: opts.publishedTime || undefined,
    twitterHandle: g.twitter_handle
  }
}

/** Plain text dari potongan HTML untuk meta description fallback. */
export function htmlToText(html: string | null | undefined, maxLen = 160): string {
  if (!html) return ''
  const text = String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text
}
