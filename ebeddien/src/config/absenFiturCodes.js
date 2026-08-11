/** Selaras migrasi / seed aksi di bawah menu.absen */
export const ABSEN_ACTION_CODES = {
  tabRiwayat: 'action.absen.tab.riwayat',
  /** Riwayat: boleh filter semua lembaga (tanpa batas jabatan/token). */
  riwayatLembagaSemua: 'action.absen.riwayat.lembaga_semua',
  tabAbsen: 'action.absen.tab.absen',
  tabPengaturan: 'action.absen.tab.pengaturan',
  tabNgabsen: 'action.absen.tab.ngabsen',
  lokasiList: 'action.absen.lokasi.list',
  lokasiAbsenMandiri: 'action.absen.lokasi.absen',
  lokasiTambah: 'action.absen.lokasi.tambah',
  lokasiUbah: 'action.absen.lokasi.ubah',
  lokasiHapus: 'action.absen.lokasi.hapus'
}

/** Kode menu induk (path /absen → menu.absen). */
export const ABSEN_MENU_CODE = 'menu.absen'

/**
 * @param {string} code
 * @returns {'riwayat'|'absen'|'pengaturan'|'ngabsen'|null}
 */
export function absenActionTabKey(code) {
  const c = String(code || '')
  if (c === ABSEN_ACTION_CODES.tabRiwayat || c.startsWith('action.absen.riwayat.')) {
    return 'riwayat'
  }
  if (c === ABSEN_ACTION_CODES.tabPengaturan || c.startsWith('action.absen.pengaturan.')) {
    return 'pengaturan'
  }
  /** Pengaturan titik lokasi (CRUD) — accordion Tab Pengaturan. */
  if (
    c === ABSEN_ACTION_CODES.lokasiList ||
    c === ABSEN_ACTION_CODES.lokasiTambah ||
    c === ABSEN_ACTION_CODES.lokasiUbah ||
    c === ABSEN_ACTION_CODES.lokasiHapus
  ) {
    return 'pengaturan'
  }
  /** Absen mandiri GPS — accordion Tab Absen (akses pemakaian, bukan kelola titik). */
  if (c === ABSEN_ACTION_CODES.lokasiAbsenMandiri) {
    return 'absen'
  }
  if (c === ABSEN_ACTION_CODES.tabAbsen || c.startsWith('action.absen.absen.')) {
    return 'absen'
  }
  if (c === ABSEN_ACTION_CODES.tabNgabsen || c.startsWith('action.absen.ngabsen.')) {
    return 'ngabsen'
  }
  return null
}

export const ABSEN_TAB_ACCORDIONS = [
  {
    key: 'riwayat',
    title: 'Tab Riwayat',
    subtitle: 'Daftar & rekap; batas lembaga dari jabatan; opsi akses semua lembaga per peran'
  },
  {
    key: 'absen',
    title: 'Tab Absen',
    subtitle: 'Tampilan tab Absen; absen mandiri GPS — akses pemakaian (bukan kelola daftar titik)'
  },
  {
    key: 'pengaturan',
    title: 'Tab Pengaturan',
    subtitle: 'Jadwal default, kelola titik lokasi (daftar/tambah/ubah/hapus), siapa boleh mandiri'
  },
  {
    key: 'ngabsen',
    title: 'Tab Ngabsen',
    subtitle: 'Placeholder / arahan ke tab Absen untuk GPS'
  }
]

/**
 * @param {Array<{ code?: string }>} children
 * @returns {{ riwayat: any[], absen: any[], pengaturan: any[], ngabsen: any[], other: any[] }}
 */
export function groupAbsenFiturChildren(children) {
  const buckets = { riwayat: [], absen: [], pengaturan: [], ngabsen: [], other: [] }
  for (const ch of children || []) {
    const k = absenActionTabKey(ch.code)
    if (k) buckets[k].push(ch)
    else buckets.other.push(ch)
  }
  return buckets
}
