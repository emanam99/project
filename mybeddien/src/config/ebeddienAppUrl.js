/**
 * Base URL aplikasi eBeddien (staff) — untuk membuka halaman penautan santri (/mybeddian).
 * Set `VITE_EBEDDien_APP_URL` di .env bila domain tidak bisa ditebak dari hostname (mis. CDN path).
 * @returns {string} URL tanpa trailing slash, atau string kosong jika wajib set env
 */
export function getEbeddienAppUrl() {
  const env = import.meta.env.VITE_EBEDDien_APP_URL
  if (env && typeof env === 'string' && env.trim() !== '') {
    return env.trim().replace(/\/$/, '')
  }
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:5173'
    }
    const h = hostname.toLowerCase()
    if (h.includes('mybeddien')) {
      return `${protocol}//${hostname.replace(/mybeddien/gi, 'ebeddien')}`
    }
  }
  if (import.meta.env.DEV) {
    return 'http://localhost:5173'
  }
  return ''
}
