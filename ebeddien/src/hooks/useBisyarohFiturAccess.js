import { useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import { userHasSuperAdminAccess } from '../utils/roleAccess'
import { BISYAROH_ACTION_CODES as C } from '../config/bisyarohFiturCodes'

/**
 * Hak tab Bisyaroh (Rekap / Rilis / Aturan) — dari /me/fitur-menu.
 */
export function useBisyarohFiturAccess() {
  const user = useAuthStore((s) => s.user)
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)

  return useMemo(() => {
    const isSuper = userHasSuperAdminAccess(user)
    const codes = Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []
    const useApi = codes.length > 0
    const apiHasTabGranular =
      useApi && codes.some((c) => String(c).startsWith('action.bisyaroh.tab.'))
    const hasMenu = codes.includes('menu.bisyaroh')
    const hasHalaman = codes.includes(C.halaman)

    const canTab = (code, fb) => {
      if (isSuper) return true
      if (!apiHasTabGranular) return typeof fb === 'function' ? fb() : false
      return codes.includes(code)
    }

    const tabRekap = canTab(C.tabRekap, () => hasMenu || hasHalaman)
    const tabRilis =
      isSuper ||
      (apiHasTabGranular
        ? codes.includes(C.tabRilis) || codes.includes(C.tabRekap) || hasHalaman
        : hasMenu || hasHalaman)
    const tabHistori = canTab(C.tabHistori, () => hasMenu || hasHalaman)
    const tabAturan = canTab(C.tabAturan, () => hasMenu || hasHalaman)

    const apiHasBisyarohAction = useApi && codes.some((c) => String(c).startsWith('action.bisyaroh.'))
    const apiHasAturanActionGranular =
      useApi && codes.some((c) => String(c).startsWith('action.bisyaroh.aturan.'))
    /** Tanpa aksi Bisyaroh di token: sama pola menu (legacy). Setelah granular: hanya yang punya action.bisyaroh.rekap.rilis. */
    const rekapRilis =
      isSuper ||
      (!apiHasBisyarohAction ? hasMenu || hasHalaman : codes.includes(C.rekapRilis))
    const rekapExportExcel =
      isSuper ||
      (!apiHasBisyarohAction ? hasMenu || hasHalaman : codes.includes(C.rekapExportExcel))
    const transferUpload =
      isSuper ||
      (!apiHasBisyarohAction
        ? hasMenu || hasHalaman
        : codes.includes(C.transferUpload) || codes.includes(C.rekapRilis))
    const transferReconcile =
      isSuper ||
      (!apiHasBisyarohAction
        ? hasMenu || hasHalaman
        : codes.includes(C.transferReconcile) || codes.includes(C.rekapRilis))

    const noTabAccess = apiHasTabGranular && !tabRekap && !tabRilis && !tabHistori && !tabAturan

    const aturanKolom =
      isSuper ||
      (!apiHasAturanActionGranular ? tabAturan : codes.includes(C.aturanKolom) || hasHalaman)

    /** Selaras backend historiPengurusScopeMode (untuk teks bantuan UI). */
    let historiPengurusScope = 'self'
    if (isSuper) {
      historiPengurusScope = 'semua'
    } else if (apiHasTabGranular) {
      if (codes.includes(C.historiSemuaLembaga)) historiPengurusScope = 'semua'
      else if (codes.includes(C.historiLembagaPeran)) historiPengurusScope = 'lembaga'
    }

    return {
      apiHasTabGranular,
      apiHasAturanActionGranular,
      noTabAccess,
      tabRekap,
      tabRilis,
      tabHistori,
      tabAturan,
      historiPengurusScope,
      rekapRilis,
      rekapExportExcel,
      transferUpload,
      transferReconcile,
      aturanKolom
    }
  }, [user, fiturMenuCodes])
}
