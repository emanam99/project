import { NavLink } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { EbeddienChatAvatarLogo, EbeddienChatWordmark } from './EbeddienChatBranding'
import { useChatAiFiturAccess } from '../../../hooks/useChatAiFiturAccess'

/**
 * Header pelatihan superadmin — satu gaya dengan chat utama; navigasi antar Chat / Bank / Training Chat / Dashboard.
 * variant: 'bank' | 'training-chat' | 'dashboard' | 'riwayat'
 */
export default function EbeddienChatHeaderTraining({
  assistantName,
  variant,
  accountLoading,
  chatHeaderMenuOpen,
  setChatHeaderMenuOpen
}) {
  const { pageTrainingBank, pageTrainingChat, pageDashboard, pageRiwayat } = useChatAiFiturAccess()

  const subtitle =
    variant === 'bank'
      ? 'Pelatihan · Bank Q&A'
      : variant === 'dashboard'
        ? 'Pelatihan · Dashboard AI'
        : variant === 'riwayat'
          ? 'Pelatihan · Riwayat chat'
          : 'Pelatihan · Training Chat'

  const navClass = ({ isActive }) =>
    `rounded-xl border px-3 py-2 text-center text-xs font-medium transition ${
      isActive
        ? 'border-white/40 bg-white/25 text-white'
        : 'border-white/20 bg-white/10 text-white hover:bg-white/20'
    }`

  return (
    <div className="shrink-0 rounded-none bg-primary-600 text-white shadow-md sm:rounded-t-lg dark:bg-primary-800">
      <button
        type="button"
        onClick={() => setChatHeaderMenuOpen((o) => !o)}
        aria-expanded={chatHeaderMenuOpen}
        aria-controls="ebeddien-chat-header-training-panel"
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-white/10 sm:px-4 sm:py-3"
      >
        <EbeddienChatAvatarLogo loading={accountLoading} />
        <div className="min-w-0 flex-1">
          <div className="flex min-h-[1.75rem] items-center">
            <EbeddienChatWordmark assistantName={assistantName} />
          </div>
          <p className="mt-0.5 truncate text-[11px] text-primary-100 sm:text-xs">{subtitle}</p>
        </div>
        <span
          className={`shrink-0 rounded-lg p-1 text-white/90 transition-transform ${
            chatHeaderMenuOpen ? 'rotate-180' : ''
          }`}
          aria-hidden
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {chatHeaderMenuOpen ? (
          <motion.div
            id="ebeddien-chat-header-training-panel"
            role="region"
            aria-label="Navigasi pelatihan"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden border-t border-white/15"
          >
            <div className="flex flex-col gap-2 bg-black/20 px-3 py-3 sm:flex-row sm:flex-wrap sm:px-4 sm:py-4">
              <NavLink to="/chat-ai" end className={navClass} onClick={() => setChatHeaderMenuOpen(false)}>
                Chat
              </NavLink>
              {pageTrainingBank ? (
                <NavLink to="/chat-ai/training" className={navClass} onClick={() => setChatHeaderMenuOpen(false)}>
                  Bank Q&amp;A
                </NavLink>
              ) : null}
              {pageTrainingChat ? (
                <NavLink
                  to="/chat-ai/training-chat"
                  className={navClass}
                  onClick={() => setChatHeaderMenuOpen(false)}
                >
                  Training Chat
                </NavLink>
              ) : null}
              {pageDashboard ? (
                <NavLink to="/chat-ai/dashboard" className={navClass} onClick={() => setChatHeaderMenuOpen(false)}>
                  Dashboard
                </NavLink>
              ) : null}
              {pageRiwayat ? (
                <NavLink to="/chat-ai/riwayat" className={navClass} onClick={() => setChatHeaderMenuOpen(false)}>
                  Riwayat
                </NavLink>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
