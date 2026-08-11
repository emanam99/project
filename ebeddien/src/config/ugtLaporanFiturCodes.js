/** Selaras migrasi ugt_laporan_fitur_actions & ugt_laporan_tambah_fitur_actions */
export const UGT_LAPORAN_ACTION_CODES = {
  tabKoordinator: 'action.ugt.laporan.tab.koordinator',
  tabGt: 'action.ugt.laporan.tab.gt',
  tabPjgt: 'action.ugt.laporan.tab.pjgt',
  filterKoordinatorSemua: 'action.ugt.laporan.filter_koordinator_semua',
  tambahKoordinator: 'action.ugt.laporan.tambah.koordinator',
  tambahGt: 'action.ugt.laporan.tambah.gt',
  tambahPjgt: 'action.ugt.laporan.tambah.pjgt'
}

export const UGT_LAPORAN_MENU_CODE = 'menu.ugt.laporan'

/**
 * @returns {'koordinator'|'gt'|'pjgt'|null}
 */
export function ugtLaporanActionTabKey(code) {
  const c = String(code || '')
  if (c === UGT_LAPORAN_ACTION_CODES.tabKoordinator || c === UGT_LAPORAN_ACTION_CODES.tambahKoordinator) {
    return 'koordinator'
  }
  if (c === UGT_LAPORAN_ACTION_CODES.tabGt || c === UGT_LAPORAN_ACTION_CODES.tambahGt) {
    return 'gt'
  }
  if (c === UGT_LAPORAN_ACTION_CODES.tabPjgt || c === UGT_LAPORAN_ACTION_CODES.tambahPjgt) {
    return 'pjgt'
  }
  return null
}

export const UGT_LAPORAN_TAB_ACCORDIONS = [
  {
    key: 'koordinator',
    title: 'Tab Koordinator',
    subtitle: 'Akses tab dan tombol tambah laporan koordinator'
  },
  {
    key: 'gt',
    title: 'Tab GT',
    subtitle: 'Akses tab dan tombol tambah laporan GT'
  },
  {
    key: 'pjgt',
    title: 'Tab PJGT',
    subtitle: 'Akses tab dan tombol tambah laporan PJGT'
  }
]

/**
 * @param {Array<{ code?: string }>} children
 * @returns {{ koordinator: any[], gt: any[], pjgt: any[], other: any[] }}
 */
export function groupUgtLaporanFiturChildren(children) {
  const buckets = { koordinator: [], gt: [], pjgt: [], other: [] }
  for (const ch of children || []) {
    const k = ugtLaporanActionTabKey(ch.code)
    if (k) buckets[k].push(ch)
    else buckets.other.push(ch)
  }
  return buckets
}
