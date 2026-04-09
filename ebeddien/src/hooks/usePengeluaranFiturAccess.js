import { useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import { userHasSuperAdminAccess } from '../utils/roleAccess'
import { PENGELUARAN_ACTION_CODES as C } from '../config/pengeluaranFiturCodes'

function collectLembagaIds(user) {
  const s = new Set()
  if (user?.lembaga_id != null && String(user.lembaga_id).trim() !== '') {
    s.add(String(user.lembaga_id).trim())
  }
  const arr = user?.lembaga_ids
  if (Array.isArray(arr)) {
    arr.forEach((x) => {
      if (x != null && String(x).trim() !== '') s.add(String(x).trim())
    })
  }
  return [...s]
}

/**
 * Hak halaman Pengeluaran: tab, lembaga per tab, tombol rencana/draft/pengeluaran.
 * Sumber kebenaran: kode di /me/fitur-menu; fallback tanpa action.pengeluaran.* = punya menu Pengeluaran.
 */
export function usePengeluaranFiturAccess() {
  const user = useAuthStore((s) => s.user)
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)

  return useMemo(() => {
    const isSuper = userHasSuperAdminAccess(user)
    const codes = Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []
    const useApi = codes.length > 0
    const apiHasPengeluaran = useApi && codes.some((c) => String(c).startsWith('action.pengeluaran.'))
    const hasMenuPengeluaran = codes.includes('menu.pengeluaran')

    const lembagaIds = collectLembagaIds(user)

    const lembagaSemua = (code, fallbackSemua) => {
      if (isSuper) return true
      if (lembagaIds.length === 0) return true
      if (!apiHasPengeluaran) return fallbackSemua()
      return codes.includes(code)
    }

    const rencanaLembagaSemua = lembagaSemua(C.rencanaLembagaSemua, () => true)
    const pengeluaranLembagaSemua = lembagaSemua(C.pengeluaranLembagaSemua, () => true)
    const draftLembagaSemua = lembagaSemua(C.draftLembagaSemua, () => true)

    const rencanaLembagaFilterLocked =
      apiHasPengeluaran && lembagaIds.length > 0 && !rencanaLembagaSemua && !isSuper
    const pengeluaranLembagaFilterLocked =
      apiHasPengeluaran && lembagaIds.length > 0 && !pengeluaranLembagaSemua && !isSuper
    const draftLembagaFilterLocked =
      apiHasPengeluaran && lembagaIds.length > 0 && !draftLembagaSemua && !isSuper

    /** null = semua id; array = batasi ke id ini (nilai kolom lembaga di DB) */
    const allowedLembagaIdsRencana = rencanaLembagaSemua ? null : lembagaIds.length ? lembagaIds : null
    const allowedLembagaIdsPengeluaran = pengeluaranLembagaSemua ? null : lembagaIds.length ? lembagaIds : null
    const allowedLembagaIdsDraft = draftLembagaSemua ? null : lembagaIds.length ? lembagaIds : null

    const can = (code, fb) => {
      if (isSuper) return true
      if (!apiHasPengeluaran) return typeof fb === 'function' ? fb() : false
      return codes.includes(code)
    }

    const tabRencana = can(C.tabRencana, () => hasMenuPengeluaran)
    const tabPengeluaran = can(C.tabPengeluaran, () => hasMenuPengeluaran)
    const tabDraft = can(C.tabDraft, () => hasMenuPengeluaran)

    const noTabAccess =
      apiHasPengeluaran && !tabRencana && !tabPengeluaran && !tabDraft

    const rencanaBuat = can(C.rencanaBuat, () => hasMenuPengeluaran)
    const rencanaSimpan = can(C.rencanaSimpan, () => hasMenuPengeluaran)
    const rencanaSimpanDraft = can(C.rencanaSimpanDraft, () => hasMenuPengeluaran)
    const rencanaEdit = can(C.rencanaEdit, () => hasMenuPengeluaran)
    const rencanaApprove = can(C.rencanaApprove, () => hasMenuPengeluaran)
    const rencanaTolak = can(C.rencanaTolak, () => hasMenuPengeluaran)
    const rencanaHapusKomentar = can(C.rencanaHapusKomentar, () => false)

    /**
     * Centang penerima WA (rencana) + modal approve/tolak — action.pengeluaran.rencana.kelola_penerima_notif.
     * Tanpa daftar aksi pengeluaran di token: perilaku lama (boleh).
     */
    const rencanaKelolaPenerimaNotif = isSuper || !apiHasPengeluaran || codes.includes(C.rencanaKelolaPenerimaNotif)

    const itemEdit = can(C.itemEdit, () => hasMenuPengeluaran)
    const itemKelolaPenerima = can(C.itemKelolaPenerima, () => hasMenuPengeluaran)
    const itemHapus = can(C.itemHapus, () => isSuper)

    /**
     * Dropdown penerima uang (offcanvas tab pengeluaran, Aktivitas, Aktivitas TA):
     * action.pengeluaran.item.kelola_penerima ATAU aksi lama rencana.kelola_penerima_notif.
     */
    const pengeluaranUbahPenerimaUang =
      isSuper ||
      !apiHasPengeluaran ||
      codes.includes(C.itemKelolaPenerima) ||
      codes.includes(C.rencanaKelolaPenerimaNotif)

    const draftBuat = can(C.draftBuat, () => hasMenuPengeluaran)
    const draftEdit = can(C.draftEdit, () => hasMenuPengeluaran)
    const draftHapus = can(C.draftHapus, () => hasMenuPengeluaran)

    return {
      apiHasPengeluaran,
      noTabAccess,
      tabRencana,
      tabPengeluaran,
      tabDraft,
      rencanaLembagaSemua,
      pengeluaranLembagaSemua,
      draftLembagaSemua,
      rencanaLembagaFilterLocked,
      pengeluaranLembagaFilterLocked,
      draftLembagaFilterLocked,
      allowedLembagaIdsRencana,
      allowedLembagaIdsPengeluaran,
      allowedLembagaIdsDraft,
      rencanaBuat,
      rencanaSimpan,
      rencanaSimpanDraft,
      rencanaEdit,
      rencanaApprove,
      rencanaTolak,
      rencanaHapusKomentar,
      rencanaKelolaPenerimaNotif,
      /** Alias rencanaKelolaPenerimaNotif (notifikasi WA rencana). */
      kelolaPenerimaNotifWa: rencanaKelolaPenerimaNotif,
      itemKelolaPenerima,
      pengeluaranUbahPenerimaUang,
      itemEdit,
      itemHapus,
      draftBuat,
      draftEdit,
      draftHapus
    }
  }, [user, fiturMenuCodes])
}
