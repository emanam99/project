/**
 * Konfigurasi kolom export Data Pengurus.
 * Hanya kolom yang masih ada di tabel pengurus (dan dari users: email, whatsapp/no_telpon).
 * Kolom yang sudah dihapus: jabatan_legacy, daerah, no_kamar, diniyah, jabatan_diniyah,
 * kelas_diniyah, kel_diniyah, formal, jabatan_formal, kelas_formal, kel_formal, akses, level.
 */
export const EXPORT_STORAGE_KEY = 'dataPengurusExportColumns'

export const EXPORT_COLUMNS = [
  // Urutan & identitas
  { key: 'no', label: 'No' },
  { key: 'id', label: 'ID' },
  { key: 'nip', label: 'NIP' },
  { key: 'id_user', label: 'ID User' },
  { key: 'grup', label: 'Grup' },
  { key: 'gelar_awal', label: 'Gelar Awal' },
  { key: 'nama', label: 'Nama' },
  { key: 'gelar_akhir', label: 'Gelar Akhir' },
  { key: 'nik', label: 'NIK' },
  { key: 'no_kk', label: 'No KK' },
  { key: 'kategori', label: 'Kategori' },
  { key: 'status_pengurus', label: 'Status Pengurus' },
  { key: 'gender', label: 'Jenis Kelamin' },
  { key: 'tempat_lahir', label: 'Tempat Lahir' },
  { key: 'tanggal_lahir', label: 'Tanggal Lahir' },
  // Pendidikan
  { key: 'pendidikan_terakhir', label: 'Pendidikan Terakhir' },
  { key: 'sekolah', label: 'Sekolah' },
  { key: 'tahun_lulus', label: 'Tahun Lulus' },
  { key: 's1', label: 'S1' },
  { key: 's2', label: 'S2' },
  { key: 's3', label: 'S3' },
  { key: 'tmt', label: 'TMT' },
  { key: 'bidang_studi', label: 'Bidang Studi' },
  { key: 'jurusan_title', label: 'Jurusan' },
  { key: 'status_nikah', label: 'Status Nikah' },
  { key: 'pekerjaan', label: 'Pekerjaan' },
  { key: 'niy', label: 'NIY' },
  { key: 'nidn', label: 'NIDN' },
  { key: 'nuptk', label: 'NUPTK' },
  { key: 'npk', label: 'NPK' },
  // Alamat
  { key: 'dusun', label: 'Dusun' },
  { key: 'rt', label: 'RT' },
  { key: 'rw', label: 'RW' },
  { key: 'desa', label: 'Desa' },
  { key: 'kecamatan', label: 'Kecamatan' },
  { key: 'kabupaten', label: 'Kabupaten' },
  { key: 'provinsi', label: 'Provinsi' },
  { key: 'kode_pos', label: 'Kode Pos' },
  // Kontak (email & whatsapp dari tabel users via JOIN)
  { key: 'email', label: 'Email' },
  { key: 'no_telpon', label: 'No Telpon' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'status', label: 'Status' },
  // Lainnya (kolom yang masih ada di tabel pengurus)
  { key: 'sejak', label: 'Sejak' },
  { key: 'mengajar', label: 'Mengajar' },
  { key: 'nyabang', label: 'Nyabang' },
  { key: 'hijriyah', label: 'Hijriyah' },
  { key: 'masehi', label: 'Masehi' },
  { key: 'rekening_jatim', label: 'Rekening Jatim' },
  { key: 'tanggal_dibuat', label: 'Tanggal Dibuat' },
  { key: 'tanggal_update', label: 'Tanggal Update' },
  // Paling bawah: Kategori Lembaga, Lembaga, Jabatan (computed)
  { key: 'kategori_lembaga', label: 'Kategori Lembaga' },
  { key: 'lembaga', label: 'Lembaga' },
  { key: 'jabatan', label: 'Jabatan' }
]

/**
 * Ambil pilihan kolom dari localStorage. Default null (pakai default semua true).
 */
export function getStoredExportColumns() {
  try {
    const raw = localStorage.getItem(EXPORT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
  } catch (_) {}
  return null
}

/**
 * Simpan pilihan kolom ke localStorage.
 */
export function setStoredExportColumns(selected) {
  try {
    localStorage.setItem(EXPORT_STORAGE_KEY, JSON.stringify(selected))
  } catch (_) {}
}

/**
 * Nilai default: semua kolom dicentang.
 */
export function getDefaultExportColumns() {
  return EXPORT_COLUMNS.reduce((acc, { key }) => {
    acc[key] = true
    return acc
  }, {})
}

/**
 * Gabungkan dengan default (stored bisa tidak punya key baru).
 */
export function getExportColumnsSelection() {
  const defaultSel = getDefaultExportColumns()
  const stored = getStoredExportColumns()
  if (!stored) return defaultSel
  return { ...defaultSel, ...stored }
}

/**
 * Kolom yang nilainya diformat sebagai tanggal (id-ID).
 */
export const DATE_KEYS = [
  'tanggal_lahir', 'tmt', 'sejak', 'masehi', 'tanggal_dibuat', 'tanggal_update'
]
