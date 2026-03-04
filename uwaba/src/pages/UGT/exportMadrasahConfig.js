/**
 * Konfigurasi kolom export Data Madrasah (UGT).
 * Key = field di data/API, label = header di file Excel.
 * Urutan: identitas, nama, alamat, pengasuh, PJGT, koordinator & sektor, tingkatan, kurikulum, jumlah.
 */
export const EXPORT_STORAGE_KEY = 'dataMadrasahExportColumns'

export const EXPORT_COLUMNS = [
  { key: 'id', label: 'ID' },
  { key: 'identitas', label: 'Identitas (NSPN/NSM)' },
  { key: 'nama', label: 'Nama' },
  { key: 'kategori', label: 'Kategori' },
  { key: 'status', label: 'Status' },
  { key: 'dusun', label: 'Dusun' },
  { key: 'rt', label: 'RT' },
  { key: 'rw', label: 'RW' },
  { key: 'desa', label: 'Desa' },
  { key: 'kecamatan', label: 'Kecamatan' },
  { key: 'kabupaten', label: 'Kabupaten' },
  { key: 'provinsi', label: 'Provinsi' },
  { key: 'kode_pos', label: 'Kode Pos' },
  { key: 'id_koordinator', label: 'ID Koordinator (internal)' },
  { key: 'koordinator_nip', label: 'NIP Koordinator' },
  { key: 'koordinator_nama', label: 'Koordinator' },
  { key: 'koordinator_wa', label: 'No WA Koordinator' },
  { key: 'sektor', label: 'Sektor' },
  { key: 'id_pengasuh', label: 'ID Pengasuh' },
  { key: 'nama_pengasuh', label: 'Nama Pengasuh' },
  { key: 'no_pengasuh', label: 'No Pengasuh' },
  { key: 'kepala', label: 'Kepala' },
  { key: 'sekretaris', label: 'Sekretaris' },
  { key: 'bendahara', label: 'Bendahara' },
  { key: 'id_pjgt', label: 'ID PJGT' },
  { key: 'nama_pjgt', label: 'Nama PJGT' },
  { key: 'no_pjgt', label: 'No PJGT' },
  { key: 'kegiatan_pagi', label: 'Kegiatan Pagi' },
  { key: 'kegiatan_sore', label: 'Kegiatan Sore' },
  { key: 'kegiatan_malam', label: 'Kegiatan Malam' },
  { key: 'kegiatan_mulai', label: 'Jam Mulai' },
  { key: 'kegiatan_sampai', label: 'Jam Sampai' },
  { key: 'tempat', label: 'Tempat' },
  { key: 'berdiri_tahun', label: 'Berdiri Tahun' },
  { key: 'tpq', label: 'TPQ' },
  { key: 'ula', label: 'Ula' },
  { key: 'wustha', label: 'Wustha' },
  { key: 'ulya', label: 'Ulya' },
  { key: 'ma_had_ali', label: "Ma'had Ali" },
  { key: 'kelas_tertinggi', label: 'Kelas Tertinggi' },
  { key: 'kurikulum', label: 'Kurikulum' },
  { key: 'jumlah_murid', label: 'Jumlah Murid' },
  { key: 'keterangan', label: 'Keterangan' },
  { key: 'banin_banat', label: 'Banin Banat' },
  { key: 'seragam', label: 'Seragam' },
  { key: 'syahriah', label: 'Syahriah' },
  { key: 'pengelola', label: 'Pengelola' },
  { key: 'gedung_madrasah', label: 'Gedung Madrasah' },
  { key: 'kantor', label: 'Kantor' },
  { key: 'bangku', label: 'Bangku' },
  { key: 'kamar_mandi_murid', label: 'Kamar Mandi Murid' },
  { key: 'kamar_gt', label: 'Kamar GT' },
  { key: 'kamar_mandi_gt', label: 'Kamar Mandi GT' },
  { key: 'km_bersifat', label: 'KM Bersifat' },
  { key: 'konsumsi', label: 'Konsumsi' },
  { key: 'kamar_gt_jarak', label: 'Kamar GT Jarak' },
  { key: 'masyarakat', label: 'Masyarakat' },
  { key: 'alumni', label: 'Alumni' },
  { key: 'jarak_md_lain', label: 'Jarak MD Lain' },
  { key: 'alamat_nama', label: 'Alamat (nama)' }
]

/**
 * Ambil pilihan kolom dari localStorage. Default semua true.
 */
export function getStoredExportColumns() {
  try {
    const raw = localStorage.getItem(EXPORT_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return parsed
    }
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
  const o = {}
  EXPORT_COLUMNS.forEach(({ key }) => { o[key] = true })
  return o
}

/**
 * Pilihan kolom untuk UI: gabungan default + yang tersimpan.
 */
export function getExportColumnsSelection() {
  const defaultSel = getDefaultExportColumns()
  const stored = getStoredExportColumns()
  if (!stored) return defaultSel
  return { ...defaultSel, ...stored }
}
