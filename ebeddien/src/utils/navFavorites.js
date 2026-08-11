/**
 * Favorit navbar per akun (menu yang tampil di bottom nav HP).
 * Disimpan lokal: uwaba_nav_favorites_{syncId} + disinkronkan ke API (app___fitur_favorit).
 * syncId = users.id (utama) atau fallback id pengurus agar selaras token.
 */

const STORAGE_PREFIX = 'uwaba_nav_favorites_'

/** Kunci penyimpanan lokal — selaras resolveUsersId di backend. */
export function getNavFavoritesSyncId(user) {
  if (!user) return null
  const uid = user.users_id != null && Number(user.users_id) > 0 ? Number(user.users_id) : null
  if (uid != null) return String(uid)
  if (user.id != null && user.id !== '') return String(user.id)
  return null
}

export function getNavFavorites(syncId) {
  if (!syncId) return null
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + syncId)
    if (raw == null || raw === '') return null
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : null
  } catch {
    return null
  }
}

export function setNavFavorites(syncId, paths) {
  if (!syncId) return
  try {
    const value = Array.isArray(paths) ? paths : []
    localStorage.setItem(STORAGE_PREFIX + syncId, JSON.stringify(value))
  } catch (e) {
    console.warn('navFavorites: set failed', e)
  }
}

/**
 * Toggle path di daftar favorit. Return array baru.
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
