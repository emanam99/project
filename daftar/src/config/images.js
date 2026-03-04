// Konfigurasi path gambar - semua gambar di domain utama alutsmani.id/gambar
// Aplikasi daftar di daftar.alutsmani.id; folder gambar tidak di subdomain, jadi load dari https://alutsmani.id/gambar
// Override dengan VITE_GAMBAR_BASE di .env jika perlu

const GAMBAR_BASE_ENV = import.meta.env.VITE_GAMBAR_BASE

/**
 * Base URL folder gambar. Di production (subdomain alutsmani.id) mengarah ke domain utama.
 */
function getGambarBase() {
  if (GAMBAR_BASE_ENV) {
    return GAMBAR_BASE_ENV.endsWith('/') ? GAMBAR_BASE_ENV.slice(0, -1) : GAMBAR_BASE_ENV
  }
  if (typeof window !== 'undefined' && window.location.hostname.endsWith('alutsmani.id')) {
    return 'https://alutsmani.id/gambar'
  }
  return '/gambar'
}

/** Ekspor untuk backward compatibility (nilai default dev) */
export const GAMBAR_BASE = GAMBAR_BASE_ENV || '/gambar'

/**
 * Mendapatkan URL lengkap untuk file gambar (icon, logo pembayaran, gedung, dll.)
 * Di production (daftar.alutsmani.id) selalu mengarah ke https://alutsmani.id/gambar/...
 *
 * @param {string} path - Path relatif (dengan atau tanpa /) mis. 'icon-2.png' atau '/logo/dana.png'
 * @returns {string} URL lengkap ke file gambar
 */
export function getGambarUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`
  const base = getGambarBase()
  return `${base}${p}`
}
