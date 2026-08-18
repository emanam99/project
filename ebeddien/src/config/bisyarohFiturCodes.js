/** Selaras app___fitur — migrasi bisyaroh_fitur_menu_actions + transfer Jatim */
export const BISYAROH_ACTION_CODES = {
  halaman: 'action.bisyaroh.halaman',
  tabRekap: 'action.bisyaroh.tab.rekap',
  tabRilis: 'action.bisyaroh.tab.rilis',
  tabHistori: 'action.bisyaroh.tab.histori',
  tabAturan: 'action.bisyaroh.tab.aturan',
  /** Tab Rekap: boleh memilih semua lembaga (tanpa batas cakupan peran tab Rekap) */
  rekapLembagaSemua: 'action.bisyaroh.rekap.lembaga_semua',
  /** Merilis / konfirmasi transfer per pengurus */
  rekapRilis: 'action.bisyaroh.rekap.rilis',
  /** Tab Review: unduh rekap ke Excel / CSV Jatim */
  rekapExportExcel: 'action.bisyaroh.rekap.export_excel',
  /** Upload mutasi Bank Jatim */
  transferUpload: 'action.bisyaroh.transfer.upload',
  /** Rekonsiliasi / rilis manual transfer */
  transferReconcile: 'action.bisyaroh.transfer.reconcile',
  /** Histori: lihat baris semua pengurus dalam cakupan lembaga peran (bukan hanya diri sendiri) */
  historiLembagaPeran: 'action.bisyaroh.histori.lembaga_peran',
  /** Histori: filter lembaga / set seperti akses semua lembaga */
  historiSemuaLembaga: 'action.bisyaroh.histori.semua_lembaga',
  /** Tab Aturan: kolom rekap & blok aturan (set/kolom) */
  aturanKolom: 'action.bisyaroh.aturan.kolom',
}

/** Kode menu induk (path /bisyaroh → menu.bisyaroh). */
export const BISYAROH_MENU_CODE = 'menu.bisyaroh'

/**
 * @param {string} code
 * @returns {'rekap'|'rilis'|'histori'|'aturan'|null}
 */
export function bisyarohActionTabKey(code) {
  const c = String(code || '')
  if (
    c === BISYAROH_ACTION_CODES.tabRekap ||
    c.startsWith('action.bisyaroh.rekap.') ||
    c.startsWith('action.bisyaroh.transfer.')
  ) {
    return 'rekap'
  }
  if (c === BISYAROH_ACTION_CODES.tabRilis) {
    return 'rilis'
  }
  if (c === BISYAROH_ACTION_CODES.tabHistori || c.startsWith('action.bisyaroh.histori.')) {
    return 'histori'
  }
  if (c === BISYAROH_ACTION_CODES.tabAturan || c.startsWith('action.bisyaroh.aturan.')) {
    return 'aturan'
  }
  return null
}

export const BISYAROH_TAB_ACCORDIONS = [
  {
    key: 'rekap',
    title: 'Tab Rekap & Review',
    subtitle: 'Rekap pengurus, tab Review, filter lembaga, export Excel/CSV Jatim, transfer upload/reconcile'
  },
  {
    key: 'rilis',
    title: 'Tab Rilis',
    subtitle: 'Arsip batch CSV export & mutasi Bank Jatim'
  },
  {
    key: 'histori',
    title: 'Tab Histori',
    subtitle: 'Riwayat rekap yang sudah dirilis / transfer berhasil; cakupan diri sendiri / lembaga peran / semua lembaga'
  },
  {
    key: 'aturan',
    title: 'Tab Aturan',
    subtitle: 'Set Bisyaroh, kolom rekap, rumus, urutan pengurus'
  }
]

/**
 * @param {Array<{ code?: string }>} children
 * @returns {{ rekap: any[], rilis: any[], histori: any[], aturan: any[], other: any[] }}
 */
export function groupBisyarohFiturChildren(children) {
  const buckets = { rekap: [], rilis: [], histori: [], aturan: [], other: [] }
  for (const ch of children || []) {
    const k = bisyarohActionTabKey(ch.code)
    if (k) buckets[k].push(ch)
    else buckets.other.push(ch)
  }
  return buckets
}
