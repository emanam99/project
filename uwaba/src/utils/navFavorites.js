/**
 * Favorit navbar per user (menu mana yang tampil di bottom nav).
 * Disimpan di localStorage: uwaba_nav_favorites_{userId}
 * Nilai: array of path string (urutan = urutan di navbar).
 * Jika belum ada atau kosong, pakai default dari role (caller yang tentukan).
 */

const STORAGE_PREFIX = 'uwaba_nav_favorites_'

export function getNavFavorites(userId) {
  if (!userId) return null
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + userId)
    if (raw == null || raw === '') return null
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : null
  } catch {
    return null
  }
}

export function setNavFavorites(userId, paths) {
  if (!userId) return
  try {
    const value = Array.isArray(paths) ? paths : []
    localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(value))
  } catch (e) {
    console.warn('navFavorites: set failed', e)
  }
}

/**
 * Toggle path di daftar favorit. Return array baru.
 * @param {string} userId
 * @param {string[]} currentPaths - urutan path saat ini
 * @param {string} path - path yang di-toggle
 * @param {boolean} add - true = tambah ke favorit, false = hapus
 * @returns {string[]} path favorit baru
 */
export function toggleNavFavorite(currentPaths, path, add) {
  const list = [...(currentPaths || [])]
  const idx = list.indexOf(path)
  if (add) {
    if (idx === -1) list.push(path)
    return list
  }
  if (idx !== -1) list.splice(idx, 1)
  return list
}
