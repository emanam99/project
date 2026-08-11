/** Re-export truthy checker (selaras utils/booleanFlag & API PengurusBooleanHelper). */
export { isBooleanTruthy as isBisyarohCheckboxTruthy, isBooleanTruthy, booleanToStoredFlag } from '../../../utils/booleanFlag'

import { isBooleanTruthy } from '../../../utils/booleanFlag'

/** Label tipe tampilan / input kolom Bisyaroh. */
export function labelBisyarohKolomTipe(tipe) {
  if (tipe === 'rupiah') return 'Rupiah'
  if (tipe === 'persen') return 'Persen'
  if (tipe === 'teks') return 'Teks'
  if (tipe === 'checkbox') return 'Checkbox'
  return 'Angka'
}

/** Subjudul jenis kolom di header tabel rekap/review. */
export function subtitleBisyarohKolomKind(kind, inputTipe) {
  if (kind === 'formula') {
    return `Rumus · ${labelBisyarohKolomTipe(inputTipe || 'angka')}`
  }
  return `Input · ${labelBisyarohKolomTipe(inputTipe || 'angka')}`
}

/** Nilai efektif checkbox di rekap (fallback default kolom). */
export function bisyarohCheckboxEffectiveValue(value, defaultNilai) {
  if (value !== '' && value != null) return value
  if (defaultNilai !== '' && defaultNilai != null) return defaultNilai
  return '0'
}

/** Tampilan review/export untuk kolom checkbox. */
export function formatBisyarohCheckboxDisplay(value, defaultNilai = null) {
  const effective = bisyarohCheckboxEffectiveValue(value, defaultNilai)
  if (value === '' && (defaultNilai === '' || defaultNilai == null) && effective === '0') {
    return '—'
  }
  return isBooleanTruthy(effective) ? 'Ya' : 'Tidak'
}
