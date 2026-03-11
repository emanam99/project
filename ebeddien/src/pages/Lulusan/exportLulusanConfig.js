/**
 * Konfigurasi kolom export Data Lulusan.
 * Key = field di data, label = header di file export.
 */
export const EXPORT_STORAGE_KEY = 'dataLulusanExportColumns'

export const EXPORT_COLUMNS = [
  { key: 'no', label: 'No' },
  { key: 'id', label: 'ID' },
  { key: 'id_santri', label: 'ID Santri' },
  { key: 'nis', label: 'NIS' },
  { key: 'nama', label: 'Nama' },
  { key: 'nik', label: 'NIK' },
  { key: 'lembaga_nama', label: 'Lembaga' },
  { key: 'lembaga_kategori', label: 'Kategori Lembaga' },
  { key: 'id_rombel', label: 'ID Rombel' },
  { key: 'rombel_label', label: 'Rombel' },
  { key: 'tahun_ajaran', label: 'Tahun Ajaran' },
  { key: 'tanggal_dibuat', label: 'Tanggal Dibuat' }
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
