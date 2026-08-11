/** Selaras migrasi ugt_kompas_fitur_actions & MenuActionsFiturSeed::seedUgtKompas */
export const UGT_KOMPAS_ACTION_CODES = {
  tabDashboard: 'action.ugt.kompas.tab.dashboard',

  tabLomba: 'action.ugt.kompas.tab.lomba',
  lombaTambah: 'action.ugt.kompas.lomba.tambah',
  lombaUbah: 'action.ugt.kompas.lomba.ubah',
  lombaHapus: 'action.ugt.kompas.lomba.hapus',

  tabDaftar: 'action.ugt.kompas.tab.daftar',
  daftarTambah: 'action.ugt.kompas.daftar.tambah',
  daftarUbah: 'action.ugt.kompas.daftar.ubah',
  daftarHapus: 'action.ugt.kompas.daftar.hapus',

  tabNilai: 'action.ugt.kompas.tab.nilai',
  nilaiTambah: 'action.ugt.kompas.nilai.tambah',
  nilaiUbah: 'action.ugt.kompas.nilai.ubah',
  nilaiHapus: 'action.ugt.kompas.nilai.hapus',

  tabAturan: 'action.ugt.kompas.tab.aturan',
  aturanTambah: 'action.ugt.kompas.aturan.tambah',
  aturanUbah: 'action.ugt.kompas.aturan.ubah',
  aturanHapus: 'action.ugt.kompas.aturan.hapus',
}

export const UGT_KOMPAS_MENU_CODE = 'menu.ugt.kompas'

/**
 * @param {string} code
 * @returns {'dashboard'|'lomba'|'daftar'|'nilai'|'aturan'|null}
 */
export function ugtKompasActionTabKey(code) {
  const c = String(code || '')
  if (c === UGT_KOMPAS_ACTION_CODES.tabDashboard) {
    return 'dashboard'
  }
  if (c === UGT_KOMPAS_ACTION_CODES.tabLomba || c.startsWith('action.ugt.kompas.lomba.')) {
    return 'lomba'
  }
  if (c === UGT_KOMPAS_ACTION_CODES.tabDaftar || c.startsWith('action.ugt.kompas.daftar.')) {
    return 'daftar'
  }
  if (c === UGT_KOMPAS_ACTION_CODES.tabNilai || c.startsWith('action.ugt.kompas.nilai.')) {
    return 'nilai'
  }
  if (c === UGT_KOMPAS_ACTION_CODES.tabAturan || c.startsWith('action.ugt.kompas.aturan.')) {
    return 'aturan'
  }
  return null
}

export const UGT_KOMPAS_TAB_ACCORDIONS = [
  {
    key: 'dashboard',
    title: 'Tab Dashboard',
    subtitle: 'Ringkasan KPI, status pendaftaran, dan aktivitas terbaru',
  },
  {
    key: 'lomba',
    title: 'Tab Lomba',
    subtitle: 'Akses tab, tambah / ubah / hapus lomba',
  },
  {
    key: 'daftar',
    title: 'Tab Daftar',
    subtitle: 'Akses tab, tambah / ubah / hapus pendaftaran peserta',
  },
  {
    key: 'nilai',
    title: 'Tab Nilai',
    subtitle: 'Akses tab dan aksi nilai (siap untuk CRUD)',
  },
  {
    key: 'aturan',
    title: 'Tab Aturan Umum',
    subtitle: 'Akses tab dan ubah batas/catatan pendaftaran',
  },
]

/**
 * @param {Array<{ code?: string }>} children
 * @returns {{ dashboard: any[], lomba: any[], daftar: any[], nilai: any[], aturan: any[], other: any[] }}
 */
export function groupUgtKompasFiturChildren(children) {
  const buckets = { dashboard: [], lomba: [], daftar: [], nilai: [], aturan: [], other: [] }
  for (const ch of children || []) {
    const k = ugtKompasActionTabKey(ch.code)
    if (k) buckets[k].push(ch)
    else buckets.other.push(ch)
  }
  return buckets
}
