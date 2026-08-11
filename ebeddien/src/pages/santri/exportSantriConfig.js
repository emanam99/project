/**
 * Kolom eksport Data Santri — selaras biodata Data Pendaftar + id rombel/daerah seperti Excel Santri,
 * tanpa kolom khusus registrasi/pembayaran pendaftar.
 * Urutan tampilan/eksport bisa diubah pengguna (localStorage terpisah dari centang kolom).
 */
export const EXPORT_STORAGE_KEY = 'dataSantriExportColumns'
export const EXPORT_COLUMN_ORDER_STORAGE_KEY = 'dataSantriExportColumnOrder'

/** Definisi default (urutan awal = urutan di bawah). */
export const EXPORT_COLUMNS = [
  { key: 'no', label: 'No' },
  { key: 'id', label: 'ID' },
  { key: 'nis', label: 'NIS', required: true },
  { key: 'nama', label: 'Nama' },
  { key: 'nik', label: 'NIK', required: true },
  { key: 'gender', label: 'Jenis Kelamin' },
  { key: 'tempat_lahir', label: 'Tempat Lahir' },
  { key: 'tanggal_lahir', label: 'Tanggal Lahir' },
  { key: 'nisn', label: 'NISN' },
  { key: 'no_kk', label: 'No KK' },
  { key: 'kepala_keluarga', label: 'Kepala Keluarga' },
  { key: 'anak_ke', label: 'Anak Ke' },
  { key: 'jumlah_saudara', label: 'Jumlah Saudara' },
  { key: 'saudara_di_pesantren', label: 'Saudara di Pesantren' },
  { key: 'hobi', label: 'Hobi' },
  { key: 'cita_cita', label: 'Cita-cita' },
  { key: 'kebutuhan_khusus', label: 'Kebutuhan Khusus' },
  { key: 'ayah', label: 'Ayah' },
  { key: 'status_ayah', label: 'Status Ayah' },
  { key: 'nik_ayah', label: 'NIK Ayah' },
  { key: 'tempat_lahir_ayah', label: 'Tempat Lahir Ayah' },
  { key: 'tanggal_lahir_ayah', label: 'Tanggal Lahir Ayah' },
  { key: 'pekerjaan_ayah', label: 'Pekerjaan Ayah' },
  { key: 'pendidikan_ayah', label: 'Pendidikan Ayah' },
  { key: 'penghasilan_ayah', label: 'Penghasilan Ayah' },
  { key: 'ibu', label: 'Ibu' },
  { key: 'status_ibu', label: 'Status Ibu' },
  { key: 'nik_ibu', label: 'NIK Ibu' },
  { key: 'tempat_lahir_ibu', label: 'Tempat Lahir Ibu' },
  { key: 'tanggal_lahir_ibu', label: 'Tanggal Lahir Ibu' },
  { key: 'pekerjaan_ibu', label: 'Pekerjaan Ibu' },
  { key: 'pendidikan_ibu', label: 'Pendidikan Ibu' },
  { key: 'penghasilan_ibu', label: 'Penghasilan Ibu' },
  { key: 'hubungan_wali', label: 'Hubungan Wali' },
  { key: 'wali', label: 'Wali' },
  { key: 'nik_wali', label: 'NIK Wali' },
  { key: 'tempat_lahir_wali', label: 'Tempat Lahir Wali' },
  { key: 'tanggal_lahir_wali', label: 'Tanggal Lahir Wali' },
  { key: 'pekerjaan_wali', label: 'Pekerjaan Wali' },
  { key: 'pendidikan_wali', label: 'Pendidikan Wali' },
  { key: 'penghasilan_wali', label: 'Penghasilan Wali' },
  { key: 'dusun', label: 'Dusun' },
  { key: 'rt', label: 'RT' },
  { key: 'rw', label: 'RW' },
  { key: 'desa', label: 'Desa' },
  { key: 'kecamatan', label: 'Kecamatan' },
  { key: 'kabupaten', label: 'Kabupaten' },
  { key: 'provinsi', label: 'Provinsi' },
  { key: 'kode_pos', label: 'Kode Pos' },
  { key: 'alamat', label: 'Alamat (gabungan)' },
  { key: 'madrasah', label: 'Madrasah' },
  { key: 'nama_madrasah', label: 'Nama Madrasah' },
  { key: 'alamat_madrasah', label: 'Alamat Madrasah' },
  { key: 'lulus_madrasah', label: 'Lulus Madrasah' },
  { key: 'sekolah', label: 'Sekolah' },
  { key: 'nama_sekolah', label: 'Nama Sekolah' },
  { key: 'alamat_sekolah', label: 'Alamat Sekolah' },
  { key: 'lulus_sekolah', label: 'Lulus Sekolah' },
  { key: 'npsn', label: 'NPSN' },
  { key: 'nsm', label: 'NSM' },
  { key: 'no_telpon', label: 'No Telpon' },
  { key: 'email', label: 'Email' },
  { key: 'no_wa_santri', label: 'No WA' },
  { key: 'riwayat_sakit', label: 'Riwayat Sakit' },
  { key: 'ukuran_baju', label: 'Ukuran Baju' },
  { key: 'kip', label: 'KIP' },
  { key: 'pkh', label: 'PKH' },
  { key: 'kks', label: 'KKS' },
  { key: 'status_nikah', label: 'Status Nikah' },
  { key: 'pekerjaan', label: 'Pekerjaan' },
  { key: 'kategori', label: 'Kategori' },
  { key: 'id_daerah', label: 'ID Daerah' },
  { key: 'id_kamar', label: 'ID Kamar' },
  { key: 'daerah', label: 'Daerah (dari id_kamar)' },
  { key: 'kamar', label: 'Kamar (dari id_kamar)' },
  { key: 'daerah_kamar', label: 'Daerah.Kamar' },
  { key: 'id_diniyah', label: 'ID Rombel Diniyah' },
  { key: 'diniyah', label: 'Lembaga Diniyah' },
  { key: 'kelas_diniyah', label: 'Kelas Diniyah' },
  { key: 'kel_diniyah', label: 'Kel Diniyah' },
  { key: 'nim_diniyah', label: 'NIM Diniyah' },
  { key: 'id_formal', label: 'ID Rombel Formal' },
  { key: 'formal', label: 'Lembaga Formal' },
  { key: 'kelas_formal', label: 'Kelas Formal' },
  { key: 'kel_formal', label: 'Kel Formal' },
  { key: 'nim_formal', label: 'NIM Formal' },
  { key: 'lttq', label: 'LTTQ' },
  { key: 'kelas_lttq', label: 'Kelas LTTQ' },
  { key: 'kel_lttq', label: 'Kel LTTQ' },
  { key: 'status_santri', label: 'Status Santri' },
  { key: 'status_pendaftar', label: 'Status Pendaftar' },
  { key: 'status_murid', label: 'Status Murid' }
]

const EXPORT_COLUMNS_BY_KEY = new Map(EXPORT_COLUMNS.map((c) => [c.key, c]))

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

export function getStoredColumnOrderKeys() {
  try {
    const raw = localStorage.getItem(EXPORT_COLUMN_ORDER_STORAGE_KEY)
    if (!raw) return null
    const keys = JSON.parse(raw)
    if (!Array.isArray(keys) || keys.length === 0) return null
    return keys.map(String)
  } catch (_) {}
  return null
}

export function setStoredColumnOrderKeys(keys) {
  try {
    localStorage.setItem(EXPORT_COLUMN_ORDER_STORAGE_KEY, JSON.stringify(keys))
  } catch (_) {}
}

/** Urutan kolom untuk UI & file: gabungkan urutan tersimpan dengan kolom baru di akhir. */
export function getOrderedExportColumns() {
  const stored = getStoredColumnOrderKeys()
  if (!stored) return [...EXPORT_COLUMNS]
  const ordered = []
  const seen = new Set()
  stored.forEach((k) => {
    const col = EXPORT_COLUMNS_BY_KEY.get(k)
    if (col) {
      ordered.push(col)
      seen.add(k)
    }
  })
  EXPORT_COLUMNS.forEach((c) => {
    if (!seen.has(c.key)) ordered.push(c)
  })
  return ordered
}

/** Gabungan alamat satu baris (selaras konsep export Data Pendaftar). */
export function buildAlamatGabungan(row) {
  if (!row || typeof row !== 'object') return ''
  const existing = row.alamat != null && String(row.alamat).trim() !== '' ? String(row.alamat).trim() : ''
  if (existing) return existing
  const parts = [
    row.dusun,
    row.rt != null && row.rt !== '' ? `RT ${row.rt}` : '',
    row.rw != null && row.rw !== '' ? `RW ${row.rw}` : '',
    row.desa,
    row.kecamatan,
    row.kabupaten,
    row.provinsi,
    row.kode_pos != null && row.kode_pos !== '' ? String(row.kode_pos) : ''
  ].filter((p) => p != null && String(p).trim() !== '')
  return parts.length ? parts.join(', ') : ''
}
