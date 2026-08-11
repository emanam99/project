/** Penyimpanan pilihan akses UI (localStorage) — tanpa impor lain agar aman untuk authStore. */

export const ACCESS_STORAGE_PICK_KEY = 'mybeddian_access_pick'
export const ACCESS_STORAGE_LEGACY_KEY = 'mybeddian_active_access'

/** @returns {{ mode: string, santriId?: number } | null} */
export function readStoredAccessPick() {
  try {
    const raw = localStorage.getItem(ACCESS_STORAGE_PICK_KEY)
    if (raw) {
      const o = JSON.parse(raw)
      if (o && typeof o.mode === 'string') {
        const out = { mode: o.mode }
        if (o.santriId != null && o.santriId !== '') {
          const n = Number(o.santriId)
          if (!Number.isNaN(n) && n > 0) out.santriId = n
        }
        return out
      }
    }
    const legacy = localStorage.getItem(ACCESS_STORAGE_LEGACY_KEY)
    if (legacy) return { mode: legacy }
  } catch (_) {
    /* abaikan */
  }
  return null
}

/** @param {{ mode: string, santriId?: number } | null | undefined} pick */
export function writeStoredAccessPick(pick) {
  try {
    if (pick && pick.mode) {
      const toSave = { mode: pick.mode }
      if (pick.santriId != null && pick.santriId > 0) toSave.santriId = pick.santriId
      localStorage.setItem(ACCESS_STORAGE_PICK_KEY, JSON.stringify(toSave))
      localStorage.setItem(ACCESS_STORAGE_LEGACY_KEY, pick.mode)
      return
    }
    localStorage.removeItem(ACCESS_STORAGE_PICK_KEY)
    localStorage.removeItem(ACCESS_STORAGE_LEGACY_KEY)
  } catch (_) {
    /* abaikan */
  }
}

export function clearStoredAccessPick() {
  writeStoredAccessPick(null)
}
