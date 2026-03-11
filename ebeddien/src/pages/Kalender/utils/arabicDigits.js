// Angka Arab-Indic (٠١٢٣٤٥٦٧٨٩) untuk tampilan kalender Hijriyah
const ARABIC_NUMERALS = '٠١٢٣٤٥٦٧٨٩'

/**
 * Ubah bilangan ke angka Arab
 * @param {number|string} n
 * @returns {string}
 */
export function toArabicDigits(n) {
  const s = String(Number(n))
  return s.replace(/[0-9]/g, (d) => ARABIC_NUMERALS[parseInt(d, 10)])
}
