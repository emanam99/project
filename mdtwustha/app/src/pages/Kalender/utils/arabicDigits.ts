const ARABIC_NUMERALS = '٠١٢٣٤٥٦٧٨٩'

export function toArabicDigits(n: number | string): string {
  const s = String(Number(n))
  return s.replace(/[0-9]/g, (d) => ARABIC_NUMERALS[parseInt(d, 10)])
}
