import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { EbeddienChatAvatarLogo, EbeddienChatWordmark } from './EbeddienChatBranding'

/**
 * Header chat utama (mode Utama/Alternatif, font, pelatihan superadmin) — dipasang di slot layout /chat-ai.
 */
export default function EbeddienChatHeaderMain({
  assistantName,
  accountLoading,
  aiChatMode,
  setAiChatMode,
  chatFontScale,
  setChatFontScale,
  chatHeaderMenuOpen,
  setChatHeaderMenuOpen,
  isSuperAdminTraining,
  dsToken,
  handleLogout
}) {
  return (
    <div className="shrink-0 rounded-none bg-primary-600 text-white shadow-md sm:rounded-t-lg dark:bg-primary-800">
      <button
        type="button"
        onClick={() => setChatHeaderMenuOpen((o) => !o)}
        aria-expanded={chatHeaderMenuOpen}
        aria-controls="ebeddien-chat-header-menu-panel"
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-white/10 sm:px-4 sm:py-3"
      >
        <EbeddienChatAvatarLogo loading={accountLoading} />
        <div className="min-w-0 flex-1">
          <div className="flex min-h-[1.75rem] items-center">
            <EbeddienChatWordmark assistantName={assistantName} />
          </div>
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
            id="ebeddien-chat-header-menu-panel"
            role="region"
            aria-label="Pengaturan obrolan"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden border-t border-white/15"
          >
            <div className="space-y-4 bg-black/15 px-3 py-3 sm:px-4 sm:py-4">
              <div>
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-primary-100/90">Mode</p>
                <div
                  className="flex w-full rounded-xl border border-white/25 bg-white/5 p-0.5"
                  role="group"
                  aria-label={`Mode ${assistantName}`}
                >
                  <button
                    type="button"
                    onClick={() => setAiChatMode('proxy')}
                    className={
                      aiChatMode === 'proxy'
                        ? 'flex-1 rounded-lg bg-white/25 py-2 text-xs font-semibold text-white shadow-sm'
                        : 'flex-1 rounded-lg py-2 text-xs font-medium text-primary-100 hover:bg-white/10'
                    }
                  >
                    Alternatif
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiChatMode('api')}
                    className={
                      aiChatMode === 'api'
                        ? 'flex-1 rounded-lg bg-white/25 py-2 text-xs font-semibold text-white shadow-sm'
                        : 'flex-1 rounded-lg py-2 text-xs font-medium text-primary-100 hover:bg-white/10'
                    }
                  >
                    Utama
                  </button>
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-primary-100/90">
                  Ukuran teks obrolan
                </p>
                <div className="flex w-full rounded-xl border border-white/25 bg-white/5 p-0.5" role="group" aria-label="Ukuran font chat">
                  {[
                    { key: 'sm', label: 'Kecil' },
                    { key: 'md', label: 'Sedang' },
                    { key: 'lg', label: 'Besar' }
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setChatFontScale(key)}
                      title={label}
                      className={
                        chatFontScale === key
                          ? 'flex-1 rounded-lg bg-white/25 py-2 text-xs font-semibold text-white shadow-sm'
                          : 'flex-1 rounded-lg py-2 text-xs font-medium text-primary-100 hover:bg-white/10'
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {isSuperAdminTraining ? (
                <div>
                  <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-primary-100/90">Pelatihan</p>
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
                    <Link
                      to="/chat-ai/training"
                      onClick={() => setChatHeaderMenuOpen(false)}
                      className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-center text-xs font-medium text-white hover:bg-white/20"
                    >
                      Bank Q&amp;A
                    </Link>
                    <Link
                      to="/chat-ai/training-chat"
                      onClick={() => setChatHeaderMenuOpen(false)}
                      className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-center text-xs font-medium text-white hover:bg-white/20"
                    >
                      Training Chat
                    </Link>
                  </div>
                </div>
              ) : null}

              {dsToken && aiChatMode === 'proxy' ? (
                <div>
                  <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-primary-100/90">Mode alternatif</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        handleLogout()
                        setChatHeaderMenuOpen(false)
                      }}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-xs font-medium text-white hover:bg-white/20"
                    >
                      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                        />
                      </svg>
                      Keluar alternatif
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
