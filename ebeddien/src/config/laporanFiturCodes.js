/** Kode action di bawah menu /laporan (grup UWABA) — selaras migrasi laporan_uwaba_fitur_actions */
export const LAPORAN_ACTION_CODES = {
  tabTunggakan: 'action.laporan.tab.tunggakan',
  tabKhusus: 'action.laporan.tab.khusus',
  tabUwaba: 'action.laporan.tab.uwaba',
  tabPendaftaran: 'action.laporan.tab.pendaftaran'
}

export const LAPORAN_MENU_CODE = 'menu.laporan'

/** Tab UWABA (bukan PSB) — untuk deteksi grup laporan tanpa daftar role statis */
export const LAPORAN_UWABA_TAB_CODES = [
  LAPORAN_ACTION_CODES.tabTunggakan,
  LAPORAN_ACTION_CODES.tabKhusus,
  LAPORAN_ACTION_CODES.tabUwaba
]

/**
 * @returns {'tunggakan'|'khusus'|'uwaba'|'pendaftaran'|null}
 */
export function laporanUwabaActionTabKey(code) {
  const c = String(code || '')
  if (c === LAPORAN_ACTION_CODES.tabTunggakan) return 'tunggakan'
  if (c === LAPORAN_ACTION_CODES.tabKhusus) return 'khusus'
  if (c === LAPORAN_ACTION_CODES.tabUwaba) return 'uwaba'
  if (c === LAPORAN_ACTION_CODES.tabPendaftaran) return 'pendaftaran'
  return null
}

export const LAPORAN_TAB_ACCORDIONS = [
  { key: 'tunggakan', title: 'Tab Tunggakan', subtitle: 'Akses tab laporan tunggakan' },
  { key: 'khusus', title: 'Tab Khusus', subtitle: 'Akses tab laporan khusus' },
  { key: 'uwaba', title: 'Tab UWABA', subtitle: 'Akses tab laporan UWABA' },
  { key: 'pendaftaran', title: 'Tab Pendaftaran', subtitle: 'Akses tab laporan pendaftaran (PSB)' }
]

/**
 * @param {Array<{ code?: string }>} children
 * @returns {{ tunggakan: any[], khusus: any[], uwaba: any[], pendaftaran: any[], other: any[] }}
 */
export function groupLaporanUwabaFiturChildren(children) {
  const buckets = { tunggakan: [], khusus: [], uwaba: [], pendaftaran: [], other: [] }
  for (const ch of children || []) {
    const k = laporanUwabaActionTabKey(ch.code)
    if (k) buckets[k].push(ch)
    else buckets.other.push(ch)
  }
  return buckets
}
