import { useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import { userHasSuperAdminAccess, userMatchesAnyAllowedRole } from '../utils/roleAccess'
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
 * Jika token belum punya action.pengeluaran.* (belum migrasi/seed): perilaku lama untuk admin_uwaba/super_admin.
 */
export function usePengeluaranFiturAccess() {
  const user = useAuthStore((s) => s.user)
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)

  return useMemo(() => {
    const isSuper = userHasSuperAdminAccess(user)
    const hasKeuangan = userMatchesAnyAllowedRole(user, ['admin_uwaba', 'admin_lembaga', 'super_admin'])
    const useApi = Array.isArray(fiturMenuCodes) && fiturMenuCodes.length > 0
    const apiHasPengeluaran =
      useApi && fiturMenuCodes.some((c) => String(c).startsWith('action.pengeluaran.'))

    const lembagaIds = collectLembagaIds(user)

    const lembagaSemua = (code, fallbackSemua) => {
      if (isSuper) return true
      if (lembagaIds.length === 0) return true
      if (!apiHasPengeluaran) return fallbackSemua()
      return fiturMenuCodes.includes(code)
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
      if (!apiHasPengeluaran) return fb()
      return fiturMenuCodes.includes(code)
    }

    const tabRencana = can(C.tabRencana, () => hasKeuangan)
    const tabPengeluaran = can(C.tabPengeluaran, () => hasKeuangan)
    const tabDraft = can(C.tabDraft, () => hasKeuangan)

    const noTabAccess =
      apiHasPengeluaran && hasKeuangan && !tabRencana && !tabPengeluaran && !tabDraft

    const rencanaBuat = can(C.rencanaBuat, () => hasKeuangan)
    const rencanaSimpan = can(C.rencanaSimpan, () => hasKeuangan)
    const rencanaSimpanDraft = can(C.rencanaSimpanDraft, () => hasKeuangan)
    const rencanaEdit = can(C.rencanaEdit, () => hasKeuangan)
    const rencanaApprove = can(C.rencanaApprove, () => hasKeuangan)
    const rencanaTolak = can(C.rencanaTolak, () => hasKeuangan)

    const itemEdit = can(C.itemEdit, () => hasKeuangan)
    const itemHapus = can(C.itemHapus, () => isSuper)

    const draftBuat = can(C.draftBuat, () => hasKeuangan)
    const draftEdit = can(C.draftEdit, () => hasKeuangan)
    const draftHapus = can(C.draftHapus, () => hasKeuangan)

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
      itemEdit,
      itemHapus,
      draftBuat,
      draftEdit,
      draftHapus
    }
  }, [user, fiturMenuCodes])
}
