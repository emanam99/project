/**
 * Base URL aset gambar (ikon, screenshot manifest, dll.)
 * — VITE_GAMBAR_BASE jika di-set; produksi tanpa env → CDN gambar.alutsmani.id; dev → /gambar (proxy Vite).
 */
export function getGambarBase(): string {
  const v = import.meta.env.VITE_GAMBAR_BASE
  if (v != null && String(v).trim() !== '') {
    return String(v).replace(/\/$/, '')
  }
  if (import.meta.env.PROD) return 'https://gambar.alutsmani.id'
  return '/gambar'
}
