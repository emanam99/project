/**
 * Konfigurasi kolom export Manage Data Tunggakan.
 * Urutan mengikuti kolom tabel Tunggakan.
 */
export const EXPORT_STORAGE_KEY = 'manageDataTunggakanExportColumns'

export const EXPORT_COLUMNS = [
  { key: 'nis', label: 'NIS' },
  { key: 'nama', label: 'Nama' },
  { key: 'status', label: 'Status' },
  { key: 'kategori', label: 'Kategori' },
  { key: 'diniyah', label: 'Diniyah' },
  { key: 'kelas_diniyah', label: 'KD' },
  { key: 'kel_diniyah', label: 'KelD' },
  { key: 'formal', label: 'Formal' },
  { key: 'kelas_formal', label: 'KF' },
  { key: 'kel_formal', label: 'KelF' },
  { key: 'lttq', label: 'LTTQ' },
  { key: 'kelas_lttq', label: 'KLTTQ' },
  { key: 'kel_lttq', label: 'KelLTTQ' },
  { key: 'hijriyah', label: 'Hijriyah' },
  { key: 'masehi', label: 'Masehi' },
  { key: 'saudara_di_pesantren', label: 'Sdr' },
  { key: 'tahun_ajaran', label: 'Tahun Ajaran' },
  { key: 'lembaga', label: 'Lembaga' },
  { key: 'keterangan_1', label: 'Keterangan 1' },
  { key: 'keterangan_2', label: 'Keterangan 2' },
  { key: 'wajib', label: 'Total Wajib' },
  { key: 'bayar', label: 'Total Bayar' },
  { key: 'kurang', label: 'Kurang' },
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
  return EXPORT_COLUMNS.reduce((acc, { key }) => { acc[key] = true; return acc }, {})
}

export function getExportColumnsSelection() {
  const defaultSel = getDefaultExportColumns()
  const stored = getStoredExportColumns()
  if (!stored) return defaultSel
  return { ...defaultSel, ...stored }
}
