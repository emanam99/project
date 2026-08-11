// Konfigurasi base URL gambar — dari .env (local / staging / production)
// Set VITE_GAMBAR_BASE di .env; produksi tanpa env: CDN https://gambar.alutsmani.id (path /icon/…, /ss/…, bukan /gambar/…).

const DEFAULT_GAMBAR_BASE = 'https://gambar.alutsmani.id'

function getGambarBase() {
  const envBase = import.meta.env.VITE_GAMBAR_BASE
  if (envBase && typeof envBase === 'string' && envBase.trim() !== '') {
    const url = envBase.trim()
    return url.endsWith('/') ? url.slice(0, -1) : url
  }
  // npm run dev: path /gambar — di vite.config biasanya di-proxy ke Apache (htdocs/gambar/), bukan alutsmani.id
  if (import.meta.env.DEV) {
    return '/gambar'
  }
  return DEFAULT_GAMBAR_BASE
}

/** Base URL gambar (dari env atau fallback) */
export const GAMBAR_BASE = getGambarBase()

/**
 * Path `/gambar/...` dari folder `public/gambar` — pakai prefix Vite BASE_URL jika app di subpath.
 */
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
 * Mendapatkan URL lengkap untuk file gambar (icon, logo bank, logo pesantren, dll.)
 * Host absolut (.env) dipakai apa adanya; path relatif ke root CDN (mis. /icon/…).
 *
 * @param {string} path - Path relatif (dengan atau tanpa /) mis. 'icon-2.png' atau '/logo/bca.png'
 * @returns {string} URL lengkap ke file gambar
 */
export function getGambarUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`
  const base = getGambarBase()
  if (/^https?:\/\//i.test(base)) {
    return `${base}${p}`
  }
  return applyViteBaseUrl(`${base}${p}`)
}
