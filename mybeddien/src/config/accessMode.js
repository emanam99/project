import { getProfilFiturAksesList } from './accessGroups'
import {
  clearStoredAccessPick,
  readStoredAccessPick,
  writeStoredAccessPick,
} from './accessStorage'

export { clearStoredAccessPick, readStoredAccessPick, writeStoredAccessPick } from './accessStorage'

/** Kunci sesi UI — satu akses aktif per waktu */
export const ACCESS_MODE = {
  santri: 'santri',
  toko: 'toko',
  pjgt: 'pjgt',
  wali: 'wali',
}

const PROFIL_ID_TO_MODE = {
  santri: ACCESS_MODE.santri,
  toko: ACCESS_MODE.toko,
  madrasah: ACCESS_MODE.pjgt,
  wali: ACCESS_MODE.wali,
}

/** id dari getProfilFiturAksesList → mode */
export function profilIdToAccessMode(profilId) {
  return PROFIL_ID_TO_MODE[profilId] ?? null
}

export function accessModeToProfilId(mode) {
  const e = Object.entries(PROFIL_ID_TO_MODE).find(([, v]) => v === mode)
  return e ? e[0] : null
}

/** @deprecated gunakan readStoredAccessPick */
export function readStoredAccessMode() {
  return readStoredAccessPick()?.mode ?? null
}

/** @deprecated gunakan writeStoredAccessPick */
export function writeStoredAccessMode(modeKey) {
  if (modeKey) writeStoredAccessPick({ mode: modeKey })
  else clearStoredAccessPick()
}

/** @deprecated */
export function clearStoredAccessMode() {
  clearStoredAccessPick()
}

/**
 * Daftar pilihan akses (per baris UI). Beberapa santri → beberapa baris dengan nama.
 * @param {Record<string, unknown> | null | undefined} user
 * @param {string} [namaMadrasah]
 * @param {object | null} [madrasahExtra]
 * @returns {{ key: string, profilId: string, title: string, description: string, santriId: number | null }[]}
 */
export function listAvailableAccessModes(user, namaMadrasah = '', madrasahExtra = null) {
  const namaFromUser = typeof user?.madrasah_nama === 'string' ? user.madrasah_nama.trim() : ''
  const namaFromProfilParam = typeof namaMadrasah === 'string' ? namaMadrasah.trim() : ''
  const namaFromMadrasahObj =
    madrasahExtra?.nama != null && String(madrasahExtra.nama).trim() !== ''
      ? String(madrasahExtra.nama).trim()
      : ''
  /** JWT `madrasah_nama` dulu — jangan pakai `res.nama` profil (bisa nama santri jika multi-akun). */
  const namaMadrasahCombined =
    namaFromUser || namaFromMadrasahObj || namaFromProfilParam

  const items = getProfilFiturAksesList(user, namaMadrasahCombined, madrasahExtra)
  /** @type {{ key: string, profilId: string, title: string, description: string, santriId: number | null }[]} */
  const out = []

  for (const item of items) {
    const key = profilIdToAccessMode(item.id)
    if (!key) continue

    if (key === ACCESS_MODE.santri) {
      const opts = Array.isArray(user?.santri_options) ? user.santri_options : []
      if (opts.length > 1) {
        for (const so of opts) {
          const nama = (so.nama && String(so.nama).trim()) || 'Tanpa nama'
          const nis = so.nis != null && String(so.nis).trim() !== '' ? String(so.nis).trim() : ''
          out.push({
            key,
            profilId: item.id,
            title: `Santri — ${nama}`,
            description: nis ? `NIS: ${nis}` : 'Biodata dan riwayat pembayaran',
            santriId: so.id != null ? Number(so.id) : null,
          })
        }
        continue
      }
      if (opts.length === 1) {
        const so = opts[0]
        const nama = (so.nama && String(so.nama).trim()) || 'Santri'
        const nis = so.nis != null && String(so.nis).trim() !== '' ? String(so.nis).trim() : ''
        out.push({
          key,
          profilId: item.id,
          title: `Santri — ${nama}`,
          description: nis ? `NIS: ${nis}` : item.description,
          santriId: so.id != null ? Number(so.id) : user?.santri_id != null ? Number(user.santri_id) : null,
        })
        continue
      }
      out.push({
        key,
        profilId: item.id,
        title: 'Santri',
        description: item.description,
        santriId: user?.santri_id != null ? Number(user.santri_id) : null,
      })
      continue
    }

    if (key === ACCESS_MODE.toko) {
      const tn = typeof user?.toko_nama === 'string' ? user.toko_nama.trim() : ''
      out.push({
        key,
        profilId: item.id,
        title: tn ? `Toko — ${tn}` : item.title,
        description: item.description,
        santriId: null,
      })
      continue
    }

    if (key === ACCESS_MODE.pjgt) {
      const mn = namaMadrasahCombined
      out.push({
        key,
        profilId: item.id,
        title: mn ? `Madrasah (PJGT) — ${mn}` : item.title,
        description: item.description,
        santriId: null,
      })
      continue
    }

    out.push({
      key,
      profilId: item.id,
      title: item.title,
      description: item.description,
      santriId: null,
    })
  }

  return out
}

/**
 * Halaman beranda workspace bersama (`/`) untuk semua akses — yang berbeda hanya nama di hero (lihat Beranda.jsx).
 * Dashboard modul (toko PJGT, dll.) tetap di path masing-masing di sidebar.
 */
export function getHomePathForAccess(modeKey) {
  switch (modeKey) {
    case ACCESS_MODE.santri:
    case ACCESS_MODE.toko:
    case ACCESS_MODE.pjgt:
    case ACCESS_MODE.wali:
      return '/'
    default:
      return '/'
  }
}

export function isValidAccessModeForUser(user, modeKey) {
  if (!modeKey || !user) return false
  const keys = listAvailableAccessModes(user).map((m) => m.key)
  return keys.includes(modeKey)
}

/**
 * Setelah verify: satu pilihan → langsung; banyak pilihan → pakai storage jika cocok dengan token, else null (harus /pilih-akses).
 * @param {Record<string, unknown> | null | undefined} user
 * @returns {string | null}
 */
export function resolveInitialActiveAccess(user) {
  const modes = listAvailableAccessModes(user)
  if (modes.length === 0) return null
  if (modes.length === 1) {
    const only = modes[0]
    writeStoredAccessPick({ mode: only.key, santriId: only.santriId ?? undefined })
    return only.key
  }

  const stored = readStoredAccessPick()
  const currentSid = user?.santri_id != null ? Number(user.santri_id) : null

  if (!stored?.mode) return null

  const rowsForMode = modes.filter((m) => m.key === stored.mode)
  if (rowsForMode.length === 0) {
    clearStoredAccessPick()
    return null
  }

  const needSantriMatch = rowsForMode.some((m) => m.santriId != null)
  if (needSantriMatch && currentSid != null) {
    const rowMatch = rowsForMode.find((m) => m.santriId != null && Number(m.santriId) === currentSid)
    if (!rowMatch) {
      clearStoredAccessPick()
      return null
    }
    if (stored.santriId != null && Number(stored.santriId) !== currentSid) {
      clearStoredAccessPick()
      return null
    }
    if (stored.santriId == null) {
      writeStoredAccessPick({ mode: stored.mode, santriId: currentSid })
    }
    return stored.mode
  }

  if (stored.santriId != null) {
    const hit = rowsForMode.find((m) => m.santriId != null && Number(m.santriId) === Number(stored.santriId))
    if (!hit) return null
  }

  return stored.mode
}
