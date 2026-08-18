/** Bulan Hijriyah laporan UGT PJGT & GT (urutan tahun ajaran). */
export const UGT_LAPORAN_BULAN_PJGT_GT = Object.freeze([12, 2, 4, 6, 8])

/** Urutan satu tahun ajaran UGT, dimulai Dzulqa'dah. */
const UGT_TAHUN_AJARAN_BULAN_ORDER = Object.freeze([11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

/**
 * @param {unknown} bulan
 * @returns {boolean}
 */
export function isUgtLaporanBulanPjgtGt(bulan) {
  const n = Number(bulan)
  return Number.isFinite(n) && UGT_LAPORAN_BULAN_PJGT_GT.includes(n)
}

/**
 * @param {{ bulan?: unknown } | null | undefined} row
 * @returns {boolean}
 */
export function rowIsUgtLaporanBulanPjgtGt(row) {
  return isUgtLaporanBulanPjgtGt(row?.bulan)
}

/**
 * Status slot laporan dibanding bulan Hijriyah aktif.
 * @param {unknown} bulan
 * @param {unknown} bulanAktif
 * @returns {'past'|'active'|'future'}
 */
export function getUgtLaporanBulanPhase(bulan, bulanAktif) {
  const target = Number(bulan)
  const active = Number(bulanAktif)
  if (target === active) return 'active'

  const targetIndex = UGT_TAHUN_AJARAN_BULAN_ORDER.indexOf(target)
  const activeIndex = UGT_TAHUN_AJARAN_BULAN_ORDER.indexOf(active)
  if (targetIndex < 0 || activeIndex < 0) return 'future'
  return targetIndex < activeIndex ? 'past' : 'future'
}
