/**
 * Konfigurasi kolom export Manage Data UWABA (Data Santri).
 * Key = field di objek row yang dibangun dari santri, label = header di file Excel.
 */
export const EXPORT_STORAGE_KEY = 'manageDataUwabaExportColumns'

export const EXPORT_COLUMNS = [
  { key: 'nis', label: 'NIS' },
  { key: 'nama', label: 'Nama' },
  { key: 'status', label: 'Status' },
  { key: 'kategori', label: 'Kategori' },
  { key: 'diniyah', label: 'Diniyah' },
  { key: 'kelas_diniyah', label: 'Kelas Diniyah' },
  { key: 'kel_diniyah', label: 'Kel Diniyah' },
  { key: 'formal', label: 'Formal' },
  { key: 'kelas_formal', label: 'Kelas Formal' },
  { key: 'kel_formal', label: 'Kel Formal' },
  { key: 'lttq', label: 'LTTQ' },
  { key: 'kelas_lttq', label: 'Kelas LTTQ' },
  { key: 'kel_lttq', label: 'Kel LTTQ' },
  { key: 'hijriyah', label: 'Hijriyah' },
  { key: 'masehi', label: 'Masehi' },
  { key: 'saudara_di_pesantren', label: 'Saudara di Pesantren' },
  { key: 'daerah', label: 'Daerah' },
  { key: 'kamar', label: 'Kamar' },
  { key: 'dusun', label: 'Dusun' },
  { key: 'rt', label: 'RT' },
  { key: 'rw', label: 'RW' },
  { key: 'desa', label: 'Desa' },
  { key: 'kecamatan', label: 'Kecamatan' },
  { key: 'kabupaten', label: 'Kabupaten' },
  { key: 'wajib_sebulan', label: 'Wajib Sebulan' },
  { key: 'wajib', label: 'Total Wajib' },
  { key: 'bayar', label: 'Total Bayar' },
  { key: 'kurang', label: 'Kurang' },
  { key: 'count', label: 'Count' },
  { key: 'status_count', label: 'Status Count' },
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
