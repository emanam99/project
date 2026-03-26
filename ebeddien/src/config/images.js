// Konfigurasi base URL gambar — dari .env (local / staging / production)
// Set VITE_GAMBAR_BASE di .env; kalau tidak set: fallback ke domain utama alutsmani.id.

const DEFAULT_GAMBAR_BASE = 'https://alutsmani.id/gambar'

function getGambarBase() {
  const envBase = import.meta.env.VITE_GAMBAR_BASE
  if (envBase && typeof envBase === 'string' && envBase.trim() !== '') {
    const url = envBase.trim()
    return url.endsWith('/') ? url.slice(0, -1) : url
  }
  return DEFAULT_GAMBAR_BASE
}

/** Base URL gambar (dari env atau fallback) */
export const GAMBAR_BASE = getGambarBase()

/**
 * Mendapatkan URL lengkap untuk file gambar (icon, logo bank, logo pesantren, dll.)
 * Di production selalu mengarah ke https://alutsmani.id/gambar/...
 *
 * @param {string} path - Path relatif (dengan atau tanpa /) mis. 'icon-2.png' atau '/logo/bca.png'
 * @returns {string} URL lengkap ke file gambar
 */
export function getGambarUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`
  const base = getGambarBase()
  return `${base}${p}`
}
