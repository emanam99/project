import { useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import { userHasSuperAdminAccess } from '../utils/roleAccess'
import { CHAT_AI_ACTION_CODES } from '../config/chatAiFiturCodes'

/**
 * Aksi Chat AI dari role___fitur. Jika belum ada kode action.chat_ai.* di API, pakai fallback (biasanya super_admin).
 */
export function buildCanChatAiAction(user, fiturMenuCodes) {
  const isSuper = userHasSuperAdminAccess(user)
  const useApi = Array.isArray(fiturMenuCodes) && fiturMenuCodes.length > 0
  const apiHasChatAi =
    useApi && fiturMenuCodes.some((c) => String(c).startsWith('action.chat_ai.'))
  return (code, fallback) => {
    if (isSuper) return true
    if (!useApi) return fallback()
    if (apiHasChatAi && String(code).startsWith('action.chat_ai.')) {
      return fiturMenuCodes.includes(code)
    }
    if (fiturMenuCodes.includes(code)) return true
    return fallback()
  }
}

export function useChatAiFiturAccess() {
  const user = useAuthStore((s) => s.user)
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)

  return useMemo(() => {
    const can = buildCanChatAiAction(user, fiturMenuCodes)
    const superFb = () => userHasSuperAdminAccess(user)
    const pageBank = can(CHAT_AI_ACTION_CODES.pageTrainingBank, superFb)
    const pageTrainingChat = can(CHAT_AI_ACTION_CODES.pageTrainingChat, superFb)
    const pageDashboard = can(CHAT_AI_ACTION_CODES.pageDashboard, superFb)
    const pageRiwayat = can(CHAT_AI_ACTION_CODES.pageRiwayat, superFb)
    const uiUserAi = can(CHAT_AI_ACTION_CODES.uiUserAiSettings, superFb)
    const uiModeAlt = can(CHAT_AI_ACTION_CODES.uiModeAlternatif, superFb)
    const showPelatihanMenu =
      pageBank || pageTrainingChat || pageDashboard || pageRiwayat || uiUserAi
    return {
      can: (code, fb) => can(code, typeof fb === 'function' ? fb : () => !!fb),
      pageTrainingBank: pageBank,
      pageTrainingChat,
      pageDashboard,
      pageRiwayat,
      uiUserAiSettings: uiUserAi,
      modeAlternatif: uiModeAlt,
      showPelatihanMenu
    }
  }, [user, fiturMenuCodes])
}
