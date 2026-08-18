/** Bulan Hijriyah laporan UGT (urutan tahun ajaran). */
export const UGT_LAPORAN_BULAN_PJGT_GT = Object.freeze([12, 2, 4, 6, 8])

/** Koordinator: Dzulqa'dah, Muharram, Rabi'ul Awal, Jumadil Awal, Rajab */
export const UGT_LAPORAN_BULAN_KOORDINATOR = Object.freeze([11, 1, 3, 5, 7])

/**
 * @param {unknown} bulan
 * @param {readonly number[]} allowed
 */
export function isUgtLaporanBulanIn(bulan, allowed) {
  const n = Number(bulan)
  return Number.isFinite(n) && allowed.includes(n)
}
