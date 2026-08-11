import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { userHasSuperAdminAccess } from '../../utils/roleAccess'
import { buildCanChatAiAction } from '../../hooks/useChatAiFiturAccess'
import { CHAT_AI_ACTION_CODES } from '../../config/chatAiFiturCodes'
import { useMemo } from 'react'

const PATH_TO_CODE = {
  '/chat-ai/training': CHAT_AI_ACTION_CODES.pageTrainingBank,
  '/chat-ai/training-chat': CHAT_AI_ACTION_CODES.pageTrainingChat,
  '/chat-ai/dashboard': CHAT_AI_ACTION_CODES.pageDashboard,
  '/chat-ai/riwayat': CHAT_AI_ACTION_CODES.pageRiwayat,
  '/chat-ai/pengaturan': CHAT_AI_ACTION_CODES.pagePengaturan,
  '/chat-ai/user-ai': CHAT_AI_ACTION_CODES.uiUserAiSettings,
}

/**
 * Mengganti SuperAdminRoute untuk sub-rute /chat-ai/* agar hak akses bisa diatur lewat Fitur (role___fitur).
 */
export default function ChatAiSubRouteGuard() {
  const { pathname } = useLocation()
  const user = useAuthStore((s) => s.user)
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)

  const allowed = useMemo(() => {
    const code = PATH_TO_CODE[pathname.replace(/\/$/, '')]
    if (!code) return false
    const can = buildCanChatAiAction(user, fiturMenuCodes)
    return can(code, () => userHasSuperAdminAccess(user))
  }, [pathname, user, fiturMenuCodes])

  if (!allowed) {
    return <Navigate to="/chat-ai" replace />
  }
  return <Outlet />
}
