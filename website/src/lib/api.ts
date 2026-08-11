/**
 * Wrapper kecil ke API Slim eBeddien (public endpoints).
 * Semua fungsi di sini boleh dipanggil dari Astro pages (SSR / build) maupun React.
 */

const API_BASE =
  (import.meta as any).env?.PUBLIC_API_BASE_URL?.replace(/\/$/, '') ||
  process.env.PUBLIC_API_BASE_URL?.replace(/\/$/, '') ||
  'https://api.alutsmani.id'

export interface BeritaListItem {
  id: number
  slug: string
  judul: string
  ringkasan: string | null
  cover_url: string | null
  kategori_id: number | null
  kategori_nama: string | null
  kategori_slug: string | null
  status: 'draft' | 'publish'
  published_at: string | null
  og_title: string | null
  og_description: string | null
  og_image: string | null
  author_nama: string | null
  updated_at: string | null
  created_at: string | null
}

export interface BeritaDetail extends BeritaListItem {
  konten_html: string | null
}

export interface KategoriBerita {
  id: number
  slug: string
  nama: string
  urutan: number
  aktif: number | boolean
}

export interface BannerItem {
  id: number
  judul: string
  gambar_url: string
  link_url: string | null
  urutan: number
  aktif: boolean
  periode_mulai: string | null
  periode_akhir: string | null
}

export interface HalamanDetail {
  id: number
  slug: string
  judul: string
  konten_html: string | null
  og_title: string | null
  og_description: string | null
  og_image: string | null
  status: 'draft' | 'publish'
  updated_at: string | null
}

export interface GaleriItem {
  id: number
  judul: string
  deskripsi: string | null
  gambar_url: string
  kategori_id: number | null
  kategori_nama: string | null
  kategori_slug: string | null
  urutan: number
  aktif: boolean
}

export interface SeoGlobal {
  site_title?: string
  site_description?: string
  site_keywords?: string
  og_default_title?: string
  og_default_description?: string
  og_default_image?: string
  twitter_handle?: string
  favicon_url?: string
}

interface ApiEnvelope<T> {
  success: boolean
  data: T
  message?: string
  pagination?: { page: number; limit: number; total: number }
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Accept: 'application/json' },
      ...init
    })
    if (!res.ok) {
      console.warn('[api]', path, '→', res.status)
      return null
    }
    const json = (await res.json()) as ApiEnvelope<T>
    if (!json?.success) return null
    return json.data
  } catch (err) {
    console.warn('[api] error', path, err)
    return null
  }
}

export async function fetchBeritaList(params: { kategori?: string; q?: string; page?: number; limit?: number } = {}) {
  const qs = new URLSearchParams()
  if (params.kategori) qs.set('kategori', params.kategori)
  if (params.q) qs.set('q', params.q)
  if (params.page) qs.set('page', String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return getJson<BeritaListItem[]>(`/api/public/website/berita${suffix}`)
}

export async function fetchBeritaBySlug(slug: string) {
  return getJson<BeritaDetail>(`/api/public/website/berita/${encodeURIComponent(slug)}`)
}

export async function fetchKategoriBerita() {
  return getJson<KategoriBerita[]>('/api/public/website/kategori-berita')
}

export async function fetchBanner() {
  return getJson<BannerItem[]>('/api/public/website/banner')
}

export async function fetchHalaman(slug: string) {
  return getJson<HalamanDetail>(`/api/public/website/halaman/${encodeURIComponent(slug)}`)
}

export async function fetchGaleri(kategori?: string) {
  const qs = kategori ? `?kategori=${encodeURIComponent(kategori)}` : ''
  return getJson<GaleriItem[]>(`/api/public/website/galeri${qs}`)
}

export async function fetchSeo() {
  return getJson<SeoGlobal>('/api/public/website/seo')
}

export { API_BASE }
