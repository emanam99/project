import { UGT_LAPORAN_ACTION_CODES } from '../config/ugtLaporanFiturCodes'

const TAMBAH_PREFIX = 'action.ugt.laporan.tambah.'

const TAMBAH_BY_JENIS = {
  koordinator: UGT_LAPORAN_ACTION_CODES.tambahKoordinator,
  gt: UGT_LAPORAN_ACTION_CODES.tambahGt,
  pjgt: UGT_LAPORAN_ACTION_CODES.tambahPjgt
}

export function userHasGranularLaporanTambahAction(fiturMenuCodes) {
  const codes = Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []
  return codes.some((c) => typeof c === 'string' && c.startsWith(TAMBAH_PREFIX))
}

/**
 * Izin tombol / form tambah laporan per jenis tab.
 * @param {'koordinator'|'gt'|'pjgt'} jenis
 * @param {boolean} hasTabAccess — tab terkait boleh dilihat (legacy bila belum ada kode tambah di JWT)
 */
export function userCanTambahLaporanUgt(fiturMenuCodes, user, jenis, hasTabAccess) {
  if (user?.is_real_super_admin) return true
  const code = TAMBAH_BY_JENIS[jenis]
  if (!code) return false
  const codes = Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []
  if (codes.includes(code)) return true
  if (!userHasGranularLaporanTambahAction(fiturMenuCodes) && hasTabAccess) return true
  return false
}
