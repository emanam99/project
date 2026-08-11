/**
 * Base URL folder gambar (logo, ikon bank, dll.)
 *
 * Prioritas:
 * 1. `VITE_GAMBAR_BASE` di .env (URL absolut atau path seperti `/gambar`)
 * 2. Saat **local** (`npm run dev` atau hostname localhost): **`/gambar`** → Vite mem‑proxy ke Apache (lihat vite.config.js)
 * 3. Produksi (tanpa env): fallback CDN gambar.alutsmani.id
 */

const DEFAULT_GAMBAR_BASE = 'https://gambar.alutsmani.id'

function isLocalRuntime() {
  if (import.meta.env.DEV) return true
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]'
}

export function getGambarBase() {
  const envBase = import.meta.env.VITE_GAMBAR_BASE
  if (envBase && typeof envBase === 'string' && envBase.trim() !== '') {
    const trimmed = envBase.trim().replace(/\/$/, '')
    // Bundle production: abaikan path /gambar dari .env lokal — aset di CDN
    if (import.meta.env.PROD && !/^https?:\/\//i.test(trimmed)) {
      return DEFAULT_GAMBAR_BASE
    }
    return trimmed
  }
  if (isLocalRuntime()) {
    return '/gambar'
  }
  return DEFAULT_GAMBAR_BASE
}

/** Base URL saat modul dimuat (untuk referensi statik); prefer `getGambarBase()` jika perlu nilai terbaru */
export const GAMBAR_BASE = getGambarBase()

function applyViteBaseUrl(rootRelativeUrl) {
  if (!rootRelativeUrl.startsWith('/') || /^https?:\/\//i.test(rootRelativeUrl)) {
    return rootRelativeUrl
  }
  const viteBase = import.meta.env.BASE_URL || '/'
  if (viteBase === '/') return rootRelativeUrl
  const prefix = viteBase.endsWith('/') ? viteBase.slice(0, -1) : viteBase
  return `${prefix}${rootRelativeUrl}`
}

/**
 * @param {string} path — mis. `/icon/mybeddienlogo.png` atau `icon/foo.png`
 */
export function getGambarUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`
  const base = getGambarBase()
  if (/^https?:\/\//i.test(base)) {
    return `${base}${p}`
  }
  return applyViteBaseUrl(`${base}${p}`)
}

/** Gambar info NIK — CDN `/info/…` (sama aplikasi daftar). */
export const DAFTAR_INFO_NIK_IMAGE = '/info/nik.jpg'

/** URL statis relatif root app (bukan folder CDN `/gambar`). */
export function getAppStaticUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`
  return applyViteBaseUrl(p)
}
