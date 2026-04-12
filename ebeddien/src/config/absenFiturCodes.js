/** Selaras migrasi / seed aksi di bawah menu.absen */
export const ABSEN_ACTION_CODES = {
  tabRiwayat: 'action.absen.tab.riwayat',
  tabAbsen: 'action.absen.tab.absen',
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
 * @returns {'riwayat'|'absen'|'ngabsen'|null}
 */
export function absenActionTabKey(code) {
  const c = String(code || '')
  if (c === ABSEN_ACTION_CODES.tabRiwayat || c.startsWith('action.absen.riwayat.')) {
    return 'riwayat'
  }
  if (c.startsWith('action.absen.lokasi.')) {
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
    subtitle: 'Daftar absensi pengurus, filter, rekap'
  },
  {
    key: 'absen',
    title: 'Tab Absen',
    subtitle: 'Daftar titik lokasi, absen mandiri GPS, tambah/ubah/hapus'
  },
  {
    key: 'ngabsen',
    title: 'Tab Ngabsen',
    subtitle: 'Absen mandiri dengan GPS di zona lokasi'
  }
]

/**
 * @param {Array<{ code?: string }>} children
 * @returns {{ riwayat: any[], absen: any[], ngabsen: any[], other: any[] }}
 */
export function groupAbsenFiturChildren(children) {
  const buckets = { riwayat: [], absen: [], ngabsen: [], other: [] }
  for (const ch of children || []) {
    const k = absenActionTabKey(ch.code)
    if (k) buckets[k].push(ch)
    else buckets.other.push(ch)
  }
  return buckets
}
