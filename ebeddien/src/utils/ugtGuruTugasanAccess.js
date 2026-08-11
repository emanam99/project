/** Kode menu / aksi UGT untuk penugasan Guru Tugas ↔ madrasah (API + UI). */

export const UGT_TUGASAN_MENU_CODES = ['menu.ugt.guru_tugas', 'menu.ugt.data_madrasah', 'menu.ugt.laporan', 'menu.koordinator']

export const ACTION_GT_TUGASAN_TAMBAH = 'action.ugt.guru_tugas.tugasan_tambah'
export const ACTION_GT_TUGASAN_HAPUS = 'action.ugt.guru_tugas.tugasan_hapus'

export function userHasGranularGtTugasanAction(fiturMenuCodes) {
  const codes = Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []
  return codes.some((c) => typeof c === 'string' && c.startsWith('action.ugt.guru_tugas.tugasan_'))
}

/** Selaras backend: tanpa kode aksi tugasan di JWT → izinkan jika konteks halaman mengizinkan (legacy). */
export function userCanTambahGtTugasan(fiturMenuCodes, user, canUseContext) {
  if (user?.is_real_super_admin) return true
  const codes = Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []
  if (codes.includes(ACTION_GT_TUGASAN_TAMBAH)) return true
  if (!userHasGranularGtTugasanAction(fiturMenuCodes) && canUseContext) return true
  return false
}

export function userCanHapusGtTugasan(fiturMenuCodes, user, canUseContext) {
  if (user?.is_real_super_admin) return true
  const codes = Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []
  if (codes.includes(ACTION_GT_TUGASAN_HAPUS)) return true
  if (!userHasGranularGtTugasanAction(fiturMenuCodes) && canUseContext) return true
  return false
}

export function userCanUgtGuruTugasTugasan(fiturMenuCodes, user) {
  const codes = Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []
  if (UGT_TUGASAN_MENU_CODES.some((c) => codes.includes(c))) return true
  if (codes.some((c) => typeof c === 'string' && c.startsWith('action.ugt.'))) return true
  const roleSet = new Set(
    [...(user?.all_roles || []), user?.role_key].filter(Boolean).map((r) => String(r).toLowerCase())
  )
  if (roleSet.has('admin_ugt') || roleSet.has('koordinator_ugt') || roleSet.has('super_admin')) return true
  if (user?.is_real_super_admin) return true
  return false
}
