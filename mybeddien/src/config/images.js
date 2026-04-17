/**
 * Base URL folder gambar (logo bank, QRIS, gedung, dll).
 * Supaya icon metode pembayaran tidak rusak: dev & subdomain pakai alutsmani.id/gambar.
 */
const GAMBAR_BASE_ENV = import.meta.env.VITE_GAMBAR_BASE
const GAMBAR_ORIGIN = 'https://alutsmani.id/gambar'

function getGambarBase() {
  const env = typeof GAMBAR_BASE_ENV === 'string' ? GAMBAR_BASE_ENV.trim() : ''
  // Jika VITE_GAMBAR_BASE terdefinisi di .env, pakai itu (local /gambar atau staging/prod URL)
  if (env) {
    return env.endsWith('/') ? env.slice(0, -1) : env
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname || ''
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('alutsmani.id')) {
      return GAMBAR_ORIGIN
    }
  }
  return '/gambar'
}

export const GAMBAR_BASE = getGambarBase()

export function getGambarUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${getGambarBase()}${p}`
}
