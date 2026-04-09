/** Selaras migrasi pengeluaran_fitur_actions */
export const PENGELUARAN_ACTION_CODES = {
  tabRencana: 'action.pengeluaran.tab.rencana',
  tabPengeluaran: 'action.pengeluaran.tab.pengeluaran',
  tabDraft: 'action.pengeluaran.tab.draft',
  rencanaLembagaSemua: 'action.pengeluaran.rencana.lembaga_semua',
  pengeluaranLembagaSemua: 'action.pengeluaran.pengeluaran.lembaga_semua',
  draftLembagaSemua: 'action.pengeluaran.draft.lembaga_semua',
  rencanaBuat: 'action.pengeluaran.rencana.buat',
  rencanaSimpan: 'action.pengeluaran.rencana.simpan',
  rencanaSimpanDraft: 'action.pengeluaran.rencana.simpan_draft',
  rencanaEdit: 'action.pengeluaran.rencana.edit',
  rencanaApprove: 'action.pengeluaran.rencana.approve',
  rencanaTolak: 'action.pengeluaran.rencana.tolak',
  /** Hapus komentar orang lain di offcanvas rencana (pemilik tetap boleh hapus komentar sendiri) */
  rencanaHapusKomentar: 'action.pengeluaran.rencana.hapus_komentar',
  /** Notifikasi WA: semua lembaga vs hanya lembaga yang sama dengan pengurus___role.lembaga_id */
  notifSemuaLembaga: 'action.pengeluaran.notif.semua_lembaga',
  notifLembagaSesuaiRole: 'action.pengeluaran.notif.lembaga_sesuai_role',
  /** Notifikasi WA hanya untuk rencana draft; satu lembaga sesuai role (tanpa varian semua lembaga) */
  draftNotifLembagaSesuaiRole: 'action.pengeluaran.draft.notif.lembaga_sesuai_role',
  /** Centang penerima WA rencana + modal approve/tolak; kompatibel mengizinkan ubah penerima uang bila tanpa aksi item.kelola_penerima */
  rencanaKelolaPenerimaNotif: 'action.pengeluaran.rencana.kelola_penerima_notif',
  itemEdit: 'action.pengeluaran.item.edit',
  /** Dropdown penerima uang / id_penerima di offcanvas (tab Pengeluaran, Aktivitas, Aktivitas TA) */
  itemKelolaPenerima: 'action.pengeluaran.item.kelola_penerima',
  itemHapus: 'action.pengeluaran.item.hapus',
  draftBuat: 'action.pengeluaran.draft.buat',
  draftEdit: 'action.pengeluaran.draft.edit',
  draftHapus: 'action.pengeluaran.draft.hapus'
}

/** Kode menu induk di app___fitur (path /pengeluaran → menu.pengeluaran). */
export const PENGELUARAN_MENU_CODE = 'menu.pengeluaran'

/**
 * Memetakan kode aksi anak menu Pengeluaran ke salah satu tab UI (rencana / pengeluaran / draft).
 * Notifikasi WA rencana (action.pengeluaran.notif.*) ke tab Rencana; draft notif (action.pengeluaran.draft.notif.*) ke tab Draft.
 * @returns {'rencana'|'pengeluaran'|'draft'|null}
 */
export function pengeluaranActionTabKey(code) {
  const c = String(code || '')
  if (
    c === PENGELUARAN_ACTION_CODES.tabRencana ||
    c.startsWith('action.pengeluaran.rencana.') ||
    c.startsWith('action.pengeluaran.notif.')
  ) {
    return 'rencana'
  }
  if (
    c === PENGELUARAN_ACTION_CODES.tabPengeluaran ||
    c.startsWith('action.pengeluaran.pengeluaran.') ||
    c.startsWith('action.pengeluaran.item.')
  ) {
    return 'pengeluaran'
  }
  if (c === PENGELUARAN_ACTION_CODES.tabDraft || c.startsWith('action.pengeluaran.draft.')) {
    return 'draft'
  }
  return null
}

/** Urutan accordion di Pengaturan → Fitur / Kelola akses role (aksi tetap entri action terpisah). */
export const PENGELUARAN_TAB_ACCORDIONS = [
  {
    key: 'rencana',
    title: 'Tab Rencana',
    subtitle: 'Akses tab, filter lembaga, buat/kirim/edit, approve/tolak, notifikasi WA, hapus komentar (moderasi)'
  },
  {
    key: 'pengeluaran',
    title: 'Tab Pengeluaran',
    subtitle: 'Akses tab, filter lembaga, edit/hapus item di offcanvas'
  },
  {
    key: 'draft',
    title: 'Tab Draft',
    subtitle: 'Akses tab, filter lembaga, buat/edit/hapus draft, notifikasi WA draft (satu lembaga)'
  }
]

/**
 * @param {Array<{ code?: string }>} children — anak menu Pengeluaran (biasanya type action), sudah terurut sort_order
 * @returns {{ rencana: any[], pengeluaran: any[], draft: any[], other: any[] }}
 */
export function groupPengeluaranFiturChildren(children) {
  const buckets = { rencana: [], pengeluaran: [], draft: [], other: [] }
  for (const ch of children || []) {
    const k = pengeluaranActionTabKey(ch.code)
    if (k) buckets[k].push(ch)
    else buckets.other.push(ch)
  }
  return buckets
}
