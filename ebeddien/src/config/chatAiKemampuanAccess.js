/**
 * Objek akses untuk tab Kemampuan Chat AI: gabungan hook Chat AI + izin menu/aksi JWT.
 */

import { userHasSuperAdminAccess } from '../utils/roleAccess'

const KEUANGAN_SKILL_ACCESS_ALL_TRUE = {
  keuanganPemasukan: true,
  keuanganPengeluaranRealisasi: true,
  keuanganRencanaAlur: true,
  keuanganReviewDraft: true,
  keuanganAnalisisDashboard: true,
  keuanganLihatDetail: true,
  keuanganPengeluaranPengaturan: true,
}

const SANTRI_SKILL_ACCESS_ALL_TRUE = {
  santriBiodataRingkas: true,
  santriDomisiliKamar: true,
  santriRombel: true,
  santriPerizinanBoyong: true,
  santriUwabaPembayaran: true,
}

/**
 * @param {string[]|null|undefined} fiturMenuCodes
 * @param {object|null|undefined} user
 * @returns {Record<string, boolean>}
 */
export function buildChatAiSantriSkillAccess(fiturMenuCodes, user) {
  if (userHasSuperAdminAccess(user)) {
    return { ...SANTRI_SKILL_ACCESS_ALL_TRUE }
  }

  const codes = new Set((fiturMenuCodes || []).map(String))
  const has = (c) => codes.has(c)
  const some = (pred) => [...codes].some(pred)

  const menuSantri = has('menu.santri') || some((c) => c.startsWith('action.santri.'))
  const menuRombel = has('menu.rombel')
  const menuDomisili = some((c) => c.startsWith('menu.domisili'))
  const menuIjin = some(
    (c) => c.startsWith('menu.ijin') || c.includes('.ijin.') || c === 'menu.dashboard_ijin',
  )
  const menuUwaba =
    has('menu.uwaba') ||
    has('menu.tunggakan') ||
    has('menu.dashboard_pembayaran') ||
    some((c) => c.includes('pembayaran'))

  return {
    santriBiodataRingkas: menuSantri,
    santriDomisiliKamar: menuDomisili || menuSantri,
    santriRombel: menuRombel || menuSantri,
    santriPerizinanBoyong: menuIjin || menuSantri,
    santriUwabaPembayaran: menuUwaba || menuSantri,
  }
}

/**
 * Selaras backend AiPendaftarAnalisisChatContextHelper::userMayReceivePendaftarAnalisis (super admin / menu & aksi pendaftaran).
 *
 * @param {string[]|null|undefined} fiturMenuCodes
 * @param {object|null|undefined} user
 * @returns {{ pendaftarAnalisis: boolean }}
 */
export function buildChatAiPendaftarAnalisisAccess(fiturMenuCodes, user) {
  if (userHasSuperAdminAccess(user)) {
    return { pendaftarAnalisis: true }
  }
  const codes = new Set((fiturMenuCodes || []).map(String))
  const has = (c) => codes.has(c)
  const some = (pred) => [...codes].some(pred)
  const ok =
    has('menu.pendaftaran') ||
    has('menu.pendaftaran.data_pendaftar') ||
    has('menu.pendaftaran.analisis') ||
    some((c) => c.startsWith('action.pendaftaran.'))
  return { pendaftarAnalisis: ok }
}

/**
 * @param {string[]|null|undefined} fiturMenuCodes
 * @param {object|null|undefined} user
 * @returns {Record<string, boolean>}
 */
export function buildChatAiKeuanganSkillAccess(fiturMenuCodes, user) {
  if (userHasSuperAdminAccess(user)) {
    return { ...KEUANGAN_SKILL_ACCESS_ALL_TRUE }
  }

  const codes = new Set((fiturMenuCodes || []).map(String))
  const has = (c) => codes.has(c)
  const some = (pred) => [...codes].some(pred)

  const menuPemasukan = has('menu.pemasukan')
  const menuPengeluaran = has('menu.pengeluaran')
  const menuDashboardKeuangan = has('menu.dashboard_keuangan')
  const menuAktivitas = has('menu.aktivitas')
  const menuAktivitasTa = has('menu.aktivitas_tahun_ajaran')

  const tabRencana =
    has('action.pengeluaran.tab.rencana') ||
    some((c) => c.startsWith('action.pengeluaran.rencana.') || c.startsWith('action.pengeluaran.notif.'))
  const tabRealisasi =
    has('action.pengeluaran.tab.pengeluaran') ||
    some((c) => c.startsWith('action.pengeluaran.pengeluaran.') || c.startsWith('action.pengeluaran.item.'))
  const tabDraft =
    has('action.pengeluaran.tab.draft') || some((c) => c.startsWith('action.pengeluaran.draft.'))
  const tabPengaturan = has('action.pengeluaran.tab.pengaturan')

  const pengeluaranHalaman = menuPengeluaran

  return {
    keuanganPemasukan: menuPemasukan,
    keuanganPengeluaranRealisasi: pengeluaranHalaman && tabRealisasi,
    keuanganRencanaAlur: pengeluaranHalaman && tabRencana,
    keuanganReviewDraft: pengeluaranHalaman && tabDraft,
    keuanganPengeluaranPengaturan: pengeluaranHalaman && tabPengaturan,
    keuanganAnalisisDashboard: menuDashboardKeuangan,
    keuanganLihatDetail: menuPemasukan || menuPengeluaran || menuAktivitas || menuAktivitasTa,
  }
}

/** Nilai dari hook useChatAiFiturAccess(). */
export function buildChatAiKemampuanAccess(chatAi, fiturMenuCodes, user) {
  return {
    pageTrainingBank: chatAi.pageTrainingBank,
    pageTrainingChat: chatAi.pageTrainingChat,
    pageDashboard: chatAi.pageDashboard,
    pageRiwayat: chatAi.pageRiwayat,
    pagePengaturan: chatAi.pagePengaturan,
    uiUserAiSettings: chatAi.uiUserAiSettings,
    modeAlternatif: chatAi.modeAlternatif,
    selectProviderManual: chatAi.selectProviderManual,
    agentUse: chatAi.agentUse,
    agentConfirmWrite: chatAi.agentConfirmWrite,
    ...buildChatAiSantriSkillAccess(fiturMenuCodes, user),
    ...buildChatAiKeuanganSkillAccess(fiturMenuCodes, user),
    ...buildChatAiPendaftarAnalisisAccess(fiturMenuCodes, user),
  }
}
