/** URL dasar folder gambar (sejajar api & app di root proyek). */
export const GAMBAR_BASE_URL = import.meta.env.DEV
  ? '/gambar'
  : (import.meta.env.VITE_GAMBAR_BASE as string | undefined)?.replace(/\/$/, '') ||
    '/mdtwustha/gambar'

export function gambarUrl(file: string): string {
  const name = file.replace(/^\/+/, '')
  return `${GAMBAR_BASE_URL}/${name}`
}
