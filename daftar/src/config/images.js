// Konfigurasi path gambar — CDN https://gambar.alutsmani.id (path /icon/…, /info/…, bukan prefix /gambar/)
// Override dengan VITE_GAMBAR_BASE di .env jika perlu

const GAMBAR_BASE_ENV = import.meta.env.VITE_GAMBAR_BASE

/**
 * Base URL folder gambar. Di production (alutsmani.id) mengarah ke CDN gambar.
 */
function getGambarBase() {
  if (GAMBAR_BASE_ENV) {
    return GAMBAR_BASE_ENV.endsWith('/') ? GAMBAR_BASE_ENV.slice(0, -1) : GAMBAR_BASE_ENV
  }
  if (typeof window !== 'undefined' && window.location.hostname.endsWith('alutsmani.id')) {
    return 'https://gambar.alutsmani.id'
  }
  return '/gambar'
}

/** Ekspor untuk backward compatibility (nilai default dev) */
export const GAMBAR_BASE = GAMBAR_BASE_ENV || '/gambar'

/**
 * Mendapatkan URL lengkap untuk file gambar (icon, logo pembayaran, gedung, dll.)
 * Di production mengarah ke CDN gambar.alutsmani.id/...
 *
 * @param {string} path - Path relatif (dengan atau tanpa /) mis. 'icon-2.png' atau '/logo/dana.png'
 * @returns {string} URL lengkap ke file gambar
 */
export function getGambarUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`
  const base = getGambarBase()
  return `${base}${p}`
}

/** Logo aplikasi daftar (santri & alumni) — light.webp / dark.webp di folder gambar. */
export function APP_LOGO_URL(theme = 'light') {
  const file = theme === 'dark' ? '/dark.webp' : '/light.webp'
  return getGambarUrl(file)
}
