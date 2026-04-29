/**
 * Konfigurasi kolom export Data Santri.
 * Key = field di data, label = header di file export.
 */
export const EXPORT_STORAGE_KEY = 'dataSantriExportColumns'

export const EXPORT_COLUMNS = [
  { key: 'no', label: 'No' },
  { key: 'id', label: 'ID' },
  { key: 'nis', label: 'NIS', required: true },
  { key: 'nama', label: 'Nama' },
  { key: 'nik', label: 'NIK', required: true },
  { key: 'gender', label: 'Jenis Kelamin' },
  { key: 'tempat_lahir', label: 'Tempat Lahir' },
  { key: 'tanggal_lahir', label: 'Tanggal Lahir' },
  { key: 'ayah', label: 'Ayah' },
  { key: 'ibu', label: 'Ibu' },
  { key: 'no_telpon', label: 'No Telpon' },
  { key: 'email', label: 'Email' },
  { key: 'dusun', label: 'Dusun' },
  { key: 'rt', label: 'RT' },
  { key: 'rw', label: 'RW' },
  { key: 'desa', label: 'Desa' },
  { key: 'kecamatan', label: 'Kecamatan' },
  { key: 'kabupaten', label: 'Kabupaten' },
  { key: 'provinsi', label: 'Provinsi' },
  { key: 'kode_pos', label: 'Kode Pos' },
  { key: 'diniyah', label: 'Lembaga Diniyah' },
  { key: 'kelas_diniyah', label: 'Kelas Diniyah' },
  { key: 'kel_diniyah', label: 'Kel Diniyah' },
  { key: 'nim_diniyah', label: 'NIM Diniyah' },
  { key: 'formal', label: 'Lembaga Formal' },
  { key: 'kelas_formal', label: 'Kelas Formal' },
  { key: 'kel_formal', label: 'Kel Formal' },
  { key: 'nim_formal', label: 'NIM Formal' },
  { key: 'lttq', label: 'LTTQ' },
  { key: 'kelas_lttq', label: 'Kelas LTTQ' },
  { key: 'kel_lttq', label: 'Kel LTTQ' },
  { key: 'daerah_kamar', label: 'Daerah.Kamar' },
  { key: 'status_santri', label: 'Status Santri' },
  { key: 'kategori', label: 'Kategori' },
  { key: 'saudara_di_pesantren', label: 'Saudara di Pesantren' }
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

const REQUIRED_KEYS = EXPORT_COLUMNS.filter((c) => c.required).map((c) => c.key)

export function getExportColumnsSelection() {
  const defaultSel = getDefaultExportColumns()
  const stored = getStoredExportColumns()
  const merged = !stored ? defaultSel : { ...defaultSel, ...stored }
  REQUIRED_KEYS.forEach((k) => { merged[k] = true })
  return merged
}
