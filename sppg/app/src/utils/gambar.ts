import { APP_VERSION } from '../config/version'

/** Base URL folder `gambar/` (dev proxy, build, atau VITE_GAMBAR_BASE). */
export function getGambarBase(): string {
  const raw = (import.meta.env.VITE_GAMBAR_BASE as string | undefined)?.trim()
  if (raw) return raw.replace(/\/$/, '')
  if (import.meta.env.DEV) return '/gambar'
  // Fallback lokal XAMPP bila build tanpa env
  return '/sppg/gambar'
}

export function gambarUrl(path: string): string {
  const clean = path.replace(/^\//, '')
  const url = `${getGambarBase()}/${clean}`
  // Cache-bust ikon agar UI + PWA tidak menahan logo lama
  if (clean.startsWith('icon/')) {
    return `${url}?v=${encodeURIComponent(APP_VERSION)}`
  }
  return url
}
