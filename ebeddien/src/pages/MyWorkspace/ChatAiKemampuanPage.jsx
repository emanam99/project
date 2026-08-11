import { useMemo } from 'react'
import { motion } from 'framer-motion'
import ChatAiSkillsPanel from '../../components/Chat/ChatAiSkillsPanel'
import { buildChatAiKemampuanAccess } from '../../config/chatAiKemampuanAccess'
import { useChatAiFiturAccess } from '../../hooks/useChatAiFiturAccess'
import { useAuthStore } from '../../store/authStore'

export default function ChatAiKemampuanPage() {
  const chatAi = useChatAiFiturAccess()
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)
  const user = useAuthStore((s) => s.user)
  const access = useMemo(
    () => buildChatAiKemampuanAccess(chatAi, fiturMenuCodes, user),
    [chatAi, fiturMenuCodes, user]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
      <div className="chat-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-3 sm:p-5">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mx-auto max-w-3xl pb-8"
        >
          <header className="mb-6">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Kemampuan AI</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Ringkasan yang bisa dilakukan modul Chat AI di eBeddien, mengikuti hak akses role Anda.
            </p>
          </header>
          <ChatAiSkillsPanel variant="page" access={access} />
        </motion.div>
      </div>
    </div>
  )
}
