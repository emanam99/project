/**
 * Base URL folder gambar (logo bank, QRIS, gedung, dll).
 * Supaya icon metode pembayaran tidak rusak: dev & subdomain pakai alutsmani.id/gambar.
 */
const GAMBAR_BASE_ENV = import.meta.env.VITE_GAMBAR_BASE
const GAMBAR_ORIGIN = 'https://alutsmani.id/gambar'

function normalizeBase(url) {
  if (!url) return ''
  const trimmed = url.trim().replace(/\/$/, '')
  if (trimmed === '/gambar' || trimmed === 'gambar') return GAMBAR_ORIGIN
  if (trimmed.startsWith('/gambar/')) return `${GAMBAR_ORIGIN}${trimmed.slice('/gambar'.length)}`
  return trimmed
}

function getGambarBase() {
  const env = typeof GAMBAR_BASE_ENV === 'string' ? GAMBAR_BASE_ENV.trim() : ''
  // Jika VITE_GAMBAR_BASE terdefinisi di .env, pakai itu (local /gambar atau staging/prod URL)
  if (env) {
    const normalized = normalizeBase(env)
    if (normalized) return normalized
  }
  return GAMBAR_ORIGIN
}

export const GAMBAR_BASE = getGambarBase()

export function getGambarUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${getGambarBase()}${p}`
}
