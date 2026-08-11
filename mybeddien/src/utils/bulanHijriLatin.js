/** Nama bulan Hijriyah (Latin), indeks 1–12 */
const NAMA = [
  '',
  'Muharram',
  'Safar',
  "Rabi'ul Awal",
  "Rabi'ul Akhir",
  'Jumadil Awal',
  'Jumadil Akhir',
  'Rajab',
  "Sya'ban",
  'Ramadan',
  'Syawal',
  'Dzulqa\'dah',
  'Dzulhijjah',
]

/**
 * @param {number|string} id 1–12
 * @returns {string}
 */
export function getBulanName(id) {
  const num = typeof id === 'string' ? parseInt(id, 10) : id
  if (!Number.isFinite(num) || num < 1 || num > 12) return `Bulan ${id}`
  return NAMA[num] || `Bulan ${num}`
}
