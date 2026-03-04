/**
 * Hari pasaran (Jawa): Legi, Pahing, Pon, Wage, Kliwon
 * Referensi: 1 Januari 1900 = Pahing (offset +1 dari Legi)
 */
const PASARAN_DAYS = ['Legi', 'Pahing', 'Pon', 'Wage', 'Kliwon']

/**
 * Hitung pasaran berdasarkan tanggal absolut
 * @param {Date} date
 * @returns {string} nama pasaran
 */
export function calculatePasaran(date) {
  const referenceDate = new Date(1900, 0, 1)
  const targetDate = new Date(date)
  referenceDate.setHours(12, 0, 0, 0)
  targetDate.setHours(12, 0, 0, 0)
  const timeDiff = targetDate.getTime() - referenceDate.getTime()
  const dayDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24))
  const pasaranIndex = ((dayDiff + 1) % 5 + 5) % 5
  return PASARAN_DAYS[pasaranIndex]
}

export { PASARAN_DAYS }
