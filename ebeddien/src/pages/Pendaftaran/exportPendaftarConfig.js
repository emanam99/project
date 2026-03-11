/**
 * Konfigurasi kolom export Data Pendaftar.
 * Semua kolom tabel santri (kecuali private: admin, grup) + kolom registrasi + computed.
 * Key = field di data, label = header di file export.
 */
export const EXPORT_STORAGE_KEY = 'dataPendaftarExportColumns'

export const EXPORT_COLUMNS = [
  // Urutan & identitas
  { key: 'no', label: 'No' },
  { key: 'id', label: 'ID' },
  { key: 'id_registrasi', label: 'ID Registrasi' },
  { key: 'nis', label: 'NIS' },
  { key: 'keterangan_status', label: 'Status' },
  { key: 'nama', label: 'Nama' },
  { key: 'nik', label: 'NIK' },
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
  // Ayah
  { key: 'ayah', label: 'Ayah' },
  { key: 'status_ayah', label: 'Status Ayah' },
  { key: 'nik_ayah', label: 'NIK Ayah' },
  { key: 'tempat_lahir_ayah', label: 'Tempat Lahir Ayah' },
  { key: 'tanggal_lahir_ayah', label: 'Tanggal Lahir Ayah' },
  { key: 'pekerjaan_ayah', label: 'Pekerjaan Ayah' },
  { key: 'pendidikan_ayah', label: 'Pendidikan Ayah' },
  { key: 'penghasilan_ayah', label: 'Penghasilan Ayah' },
  // Ibu
  { key: 'ibu', label: 'Ibu' },
  { key: 'status_ibu', label: 'Status Ibu' },
  { key: 'nik_ibu', label: 'NIK Ibu' },
  { key: 'tempat_lahir_ibu', label: 'Tempat Lahir Ibu' },
  { key: 'tanggal_lahir_ibu', label: 'Tanggal Lahir Ibu' },
  { key: 'pekerjaan_ibu', label: 'Pekerjaan Ibu' },
  { key: 'pendidikan_ibu', label: 'Pendidikan Ibu' },
  { key: 'penghasilan_ibu', label: 'Penghasilan Ibu' },
  // Wali
  { key: 'hubungan_wali', label: 'Hubungan Wali' },
  { key: 'wali', label: 'Wali' },
  { key: 'nik_wali', label: 'NIK Wali' },
  { key: 'tempat_lahir_wali', label: 'Tempat Lahir Wali' },
  { key: 'tanggal_lahir_wali', label: 'Tanggal Lahir Wali' },
  { key: 'pekerjaan_wali', label: 'Pekerjaan Wali' },
  { key: 'pendidikan_wali', label: 'Pendidikan Wali' },
  { key: 'penghasilan_wali', label: 'Penghasilan Wali' },
  // Alamat
  { key: 'dusun', label: 'Dusun' },
  { key: 'rt', label: 'RT' },
  { key: 'rw', label: 'RW' },
  { key: 'desa', label: 'Desa' },
  { key: 'kecamatan', label: 'Kecamatan' },
  { key: 'kabupaten', label: 'Kabupaten' },
  { key: 'provinsi', label: 'Provinsi' },
  { key: 'kode_pos', label: 'Kode Pos' },
  { key: 'alamat', label: 'Alamat (gabungan)' },
  // Madrasah
  { key: 'madrasah', label: 'Madrasah' },
  { key: 'nama_madrasah', label: 'Nama Madrasah' },
  { key: 'alamat_madrasah', label: 'Alamat Madrasah' },
  { key: 'lulus_madrasah', label: 'Lulus Madrasah' },
  // Sekolah
  { key: 'sekolah', label: 'Sekolah' },
  { key: 'nama_sekolah', label: 'Nama Sekolah' },
  { key: 'alamat_sekolah', label: 'Alamat Sekolah' },
  { key: 'lulus_sekolah', label: 'Lulus Sekolah' },
  { key: 'npsn', label: 'NPSN' },
  { key: 'nsm', label: 'NSM' },
  // Kontak & tambahan
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
  // Kategori & domisili (mengacu id_kamar: daerah & kamar dari JOIN daerah___kamar + daerah)
  { key: 'kategori', label: 'Kategori' },
  { key: 'id_daerah', label: 'ID Daerah' },
  { key: 'id_kamar', label: 'ID Kamar' },
  { key: 'daerah', label: 'Daerah (dari id_kamar)' },
  { key: 'kamar', label: 'Kamar (dari id_kamar)' },
  // Diniyah (dari id_diniyah / lembaga___rombel)
  { key: 'diniyah_santri', label: 'Lembaga Diniyah' },
  { key: 'kelas_diniyah', label: 'Kelas Diniyah' },
  { key: 'kel_diniyah', label: 'Kel Diniyah' },
  { key: 'nim_diniyah', label: 'NIM Diniyah' },
  // Formal (dari id_formal / lembaga___rombel)
  { key: 'formal_santri', label: 'Lembaga Formal' },
  { key: 'kelas_formal', label: 'Kelas Formal' },
  { key: 'kel_formal', label: 'Kel Formal' },
  { key: 'nim_formal', label: 'NIM Formal' },
  // LTTQ
  { key: 'lttq', label: 'LTTQ' },
  { key: 'kelas_lttq', label: 'Kelas LTTQ' },
  { key: 'kel_lttq', label: 'Kel LTTQ' },
  // Registrasi
  { key: 'diniyah', label: 'Diniyah (daftar)' },
  { key: 'formal', label: 'Formal (daftar)' },
  { key: 'gelombang', label: 'Gelombang' },
  { key: 'prodi', label: 'Prodi' },
  { key: 'tahun_ajaran', label: 'Tahun Ajaran' },
  { key: 'tanggal_dibuat', label: 'Tanggal Dibuat' },
  { key: 'status_pendaftar', label: 'Status Pendaftar' },
  { key: 'status_murid', label: 'Status Murid' },
  { key: 'status_santri', label: 'Status Santri' },
  // Pembayaran
  { key: 'total_wajib', label: 'Total Wajib' },
  { key: 'total_bayar', label: 'Total Bayar' },
  { key: 'keterangan_bayar', label: 'Keterangan (Lunas/Belum/Kurang)' }
]

/**
 * Ambil pilihan kolom dari localStorage. Default semua true.
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
