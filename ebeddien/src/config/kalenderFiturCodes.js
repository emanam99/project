/** Selaras MenuActionsFiturSeed::seedKalenderPengaturan */

export const KALENDER_PENGATURAN_TAB_BULAN = 'action.kalender.pengaturan.tab_bulan'
export const KALENDER_PENGATURAN_TAB_HARI_PENTING = 'action.kalender.pengaturan.tab_hari_penting'

/** Menu halaman Pengaturan Kalender (path /kalender/pengaturan). */
export const KALENDER_PENGATURAN_MENU_CODE = 'menu.kalender.pengaturan'

/**
 * @returns {'bulan'|'hari_penting'|null}
 */
export function kalenderPengaturanActionTabKey(code) {
  const c = String(code || '')
  if (c === KALENDER_PENGATURAN_TAB_HARI_PENTING || c.startsWith('action.hari_penting.')) {
    return 'hari_penting'
  }
  if (c === KALENDER_PENGATURAN_TAB_BULAN || c.startsWith('action.kalender.pengaturan.')) {
    return 'bulan'
  }
  return null
}

export const KALENDER_PENGATURAN_TAB_ACCORDIONS = [
  {
    key: 'bulan',
    title: 'Tab Bulan (matriks)',
    subtitle: 'Akses tab pengaturan jumlah hari per bulan hijriyah'
  },
  {
    key: 'hari_penting',
    title: 'Tab Hari penting',
    subtitle: 'Akses tab dan kebijakan target audiens hari penting'
  }
]

/**
 * @param {Array<{ code?: string }>} children
 * @returns {{ bulan: any[], hari_penting: any[], other: any[] }}
 */
export function groupKalenderPengaturanFiturChildren(children) {
  const buckets = { bulan: [], hari_penting: [], other: [] }
  for (const ch of children || []) {
    const k = kalenderPengaturanActionTabKey(ch.code)
    if (k) buckets[k].push(ch)
    else buckets.other.push(ch)
  }
  return buckets
}
