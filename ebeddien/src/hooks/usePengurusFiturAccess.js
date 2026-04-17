import { useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import { userHasSuperAdminAccess } from '../utils/roleAccess'
import { PENGURUS_ACTION_CODES as C } from '../config/pengurusFiturCodes'

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
 * Hak filter lembaga halaman Pengurus (dropdown "Lembaga").
 * Sumber: /me/fitur-menu; tanpa action.pengurus.* = perilaku lama (filter tidak dikunci).
 */
export function usePengurusFiturAccess() {
  const user = useAuthStore((s) => s.user)
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)

  return useMemo(() => {
    const isSuper = userHasSuperAdminAccess(user)
    const codes = Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []
    const useApi = codes.length > 0
    const apiHasPengurusActions = useApi && codes.some((c) => String(c).startsWith('action.pengurus.'))
    const hasMenuPengurus = codes.includes('menu.pengurus')

    const lembagaIds = collectLembagaIds(user)

    const lembagaSemua = (code, fallbackSemua) => {
      if (isSuper) return true
      if (lembagaIds.length === 0) return true
      if (!apiHasPengurusActions) return fallbackSemua()
      return codes.includes(code)
    }

    const filterLembagaSemua = lembagaSemua(C.filterLembagaSemua, () => true)

    const lembagaFilterLocked =
      apiHasPengurusActions && lembagaIds.length > 0 && !filterLembagaSemua && !isSuper

    /** null = tidak dibatasi ke id token; daftar = batasi opsi/filter ke id ini */
    const allowedLembagaIdsFilter = filterLembagaSemua ? null : lembagaIds.length ? lembagaIds : null

    return {
      apiHasPengurusActions,
      hasMenuPengurus,
      filterLembagaSemua,
      lembagaFilterLocked,
      allowedLembagaIdsFilter,
    }
  }, [user, fiturMenuCodes])
}
