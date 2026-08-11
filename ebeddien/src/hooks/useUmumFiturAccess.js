import { useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import { userHasSuperAdminAccess } from '../utils/roleAccess'
import { UMUM_ACTION_CODES as C, UMUM_MENU_CODE } from '../config/umumFiturCodes'

/**
 * Hak kemampuan UI global (Cari/Detail/Edit Santri, Detail User, Template WA).
 * Sumber: /me/fitur-menu. Jika belum ada penugasan action.umum.* sama sekali → fallback izinkan
 * (kecuali template WA yang tetap super_admin / kode eksplisit), agar deploy lama tidak putus.
 */
export function useUmumFiturAccess() {
  const user = useAuthStore((s) => s.user)
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)
  const fiturMenuFetchStatus = useAuthStore((s) => s.fiturMenuFetchStatus)

  return useMemo(() => {
    const codes = Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []
    const isSuper = userHasSuperAdminAccess(user)
    const fiturReady = fiturMenuFetchStatus === 'ok'
    const apiHasUmumAction = fiturReady && codes.some((c) => String(c).startsWith('action.umum.'))
    const hasMenuUmum = codes.includes(UMUM_MENU_CODE)

    const allow = (code, { fallback = true, superOnlyFallback = false } = {}) => {
      if (isSuper) return true
      if (codes.includes(code)) return true
      if (!apiHasUmumAction && !hasMenuUmum) {
        if (superOnlyFallback) return false
        return fallback
      }
      return false
    }

    return {
      fiturReady,
      apiHasUmumAction,
      canCariSantri: allow(C.cariSantri),
      canDetailSantri: allow(C.detailSantri),
      canEditSantri: allow(C.editSantri),
      canDetailUser: allow(C.detailUser),
      /** Template WA: historis hanya super_admin; tanpa kode Umum → tetap super saja */
      canTemplateWa: allow(C.templateWa, { fallback: false, superOnlyFallback: true }),
    }
  }, [user, fiturMenuCodes, fiturMenuFetchStatus])
}
