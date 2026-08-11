import { useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import { userHasSuperAdminAccess } from '../utils/roleAccess'

function collectLembagaIds(user) {
  const ids = new Set()
  if (user?.lembaga_id != null && String(user.lembaga_id).trim() !== '') {
    ids.add(String(user.lembaga_id).trim())
  }
  if (Array.isArray(user?.lembaga_ids)) {
    user.lembaga_ids.forEach((item) => {
      if (item != null && String(item).trim() !== '') {
        ids.add(String(item).trim())
      }
    })
  }
  return [...ids]
}

export function useLembagaFilterAccess(allLembagaActionCode) {
  const user = useAuthStore((s) => s.user)
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)

  return useMemo(() => {
    const isSuper = userHasSuperAdminAccess(user)
    const codes = Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []
    const lembagaIds = collectLembagaIds(user)
    const canFilterAllLembaga = isSuper || codes.includes(allLembagaActionCode)
    const allowedLembagaIds = canFilterAllLembaga ? null : (lembagaIds.length ? lembagaIds : null)
    const lembagaFilterLocked = !canFilterAllLembaga && Array.isArray(allowedLembagaIds) && allowedLembagaIds.length > 0

    return {
      isSuper,
      canFilterAllLembaga,
      allowedLembagaIds,
      lembagaFilterLocked,
    }
  }, [user, fiturMenuCodes, allLembagaActionCode])
}

