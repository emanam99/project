/**
 * Konfigurasi kolom export Data Ijin.
 * Key = field di objek row (dari getDataSantri), label = header di file Excel.
 * Daerah, kamar, diniyah, formal = nama (format terbaru dari API).
 */
export const EXPORT_STORAGE_KEY = 'dataIjinExportColumns'

export const EXPORT_COLUMNS = [
  { key: 'nis', label: 'NIS' },
  { key: 'nama', label: 'Nama' },
  { key: 'ayah', label: 'Ayah' },
  { key: 'ibu', label: 'Ibu' },
  { key: 'gender', label: 'Gender' },
  { key: 'status_santri', label: 'Status Santri' },
  { key: 'daerah', label: 'Daerah' },
  { key: 'kamar', label: 'Kamar' },
  { key: 'diniyah', label: 'Diniyah' },
  { key: 'kelas_diniyah', label: 'Kelas Diniyah' },
  { key: 'kel_diniyah', label: 'Kel Diniyah' },
  { key: 'formal', label: 'Formal' },
  { key: 'kelas_formal', label: 'Kelas Formal' },
  { key: 'kel_formal', label: 'Kel Formal' },
  { key: 'wajib', label: 'Wajib' },
  { key: 'bayar', label: 'Bayar' },
  { key: 'ket', label: 'Ket' }
]

export function getStoredExportColumns() {
  try {
    const raw = localStorage.getItem(EXPORT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
  } catch (_) {}
  return null
}

export function setStoredExportColumns(selected) {
  try {
    localStorage.setItem(EXPORT_STORAGE_KEY, JSON.stringify(selected))
  } catch (_) {}
}

export function getDefaultExportColumns() {
  return EXPORT_COLUMNS.reduce((acc, { key }) => {
    acc[key] = true
    return acc
  }, {})
}

export function getExportColumnsSelection() {
  const defaultSel = getDefaultExportColumns()
  const stored = getStoredExportColumns()
  if (!stored) return defaultSel
  return { ...defaultSel, ...stored }
}
