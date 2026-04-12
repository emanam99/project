import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChatAiChromeProvider } from '../../contexts/ChatAiChromeContext'
import { useChatAiFiturAccess } from '../../hooks/useChatAiFiturAccess'

const TAB_SCROLL_HIDE_MS = 900

/** Scrollbar horizontal tab: tipis, tema teal, vertikal disembunyikan; thumb muncul saat hover / fokus / sedang menggulir. */
const tabStripScrollClass =
  'overflow-y-hidden overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] [scrollbar-color:rgba(13,148,136,0.22)_transparent] dark:[scrollbar-color:rgba(45,212,191,0.28)_transparent] [&::-webkit-scrollbar]:h-[2px] [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar-corner]:bg-transparent [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-transparent hover:[&::-webkit-scrollbar-thumb]:bg-teal-600/30 focus-within:[&::-webkit-scrollbar-thumb]:bg-teal-600/30 dark:hover:[&::-webkit-scrollbar-thumb]:bg-teal-400/35 dark:focus-within:[&::-webkit-scrollbar-thumb]:bg-teal-400/35 data-[tab-scrolling=true]:[&::-webkit-scrollbar-thumb]:bg-teal-600/30 dark:data-[tab-scrolling=true]:[&::-webkit-scrollbar-thumb]:bg-teal-400/35'

/**
 * Bungkus satu kartu untuk semua rute /chat-ai/*
 * Tab bagian (Obrolan / pelatihan) di atas, scroll horizontal jika tidak muat.
 */
export default function ChatAiLayout() {
  const {
    pageTrainingBank,
    pageTrainingChat,
    pageDashboard,
    pageRiwayat,
    pagePengaturan,
    uiUserAiSettings,
    showChatAiSectionTabs
  } = useChatAiFiturAccess()

  const tabScrollHideTimerRef = useRef(null)
  const [tabStripScrolling, setTabStripScrolling] = useState(false)

  const onTabStripScroll = useCallback(() => {
    setTabStripScrolling(true)
    if (tabScrollHideTimerRef.current) clearTimeout(tabScrollHideTimerRef.current)
    tabScrollHideTimerRef.current = setTimeout(() => {
      tabScrollHideTimerRef.current = null
      setTabStripScrolling(false)
    }, TAB_SCROLL_HIDE_MS)
  }, [])

  useEffect(() => {
    return () => {
      if (tabScrollHideTimerRef.current) clearTimeout(tabScrollHideTimerRef.current)
    }
  }, [])

  const tabNavClass = ({ isActive }) =>
    `shrink-0 whitespace-nowrap px-3 sm:px-4 py-2.5 sm:py-3 text-center text-xs sm:text-sm font-medium border-b-2 transition-colors ${
      isActive
        ? 'border-teal-500 text-teal-600 dark:text-teal-400'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:border-gray-600'
    }`

  return (
    <ChatAiChromeProvider showSectionTabs={showChatAiSectionTabs}>
        <div className="h-full min-h-0 overflow-hidden bg-transparent p-0 sm:bg-primary-50/70 sm:p-3 dark:bg-transparent dark:sm:bg-gray-950 max-sm:pt-[env(safe-area-inset-top,0px)]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex h-full min-h-0 flex-col overflow-x-hidden overflow-hidden"
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ minHeight: 0 }}>
              <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-none border-0 bg-transparent shadow-none ring-0 sm:rounded-lg sm:border sm:border-gray-200/90 sm:bg-white sm:shadow-md sm:ring-1 sm:ring-primary-900/5 dark:sm:border-gray-700 dark:sm:bg-gray-800 dark:sm:ring-white/5">
                {showChatAiSectionTabs ? (
                  <div className="shrink-0 z-10 border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 sm:rounded-t-lg">
                    <div
                      role="presentation"
                      data-tab-scrolling={tabStripScrolling ? 'true' : undefined}
                      onScroll={onTabStripScroll}
                      className={tabStripScrollClass}
                    >
                    <nav
                      className="flex w-max min-w-full flex-nowrap items-stretch -mb-px"
                      aria-label="Bagian eBeddien"
                    >
                      <NavLink to="/chat-ai" end className={tabNavClass}>
                        Obrolan
                      </NavLink>
                      {pageTrainingBank ? (
                        <NavLink to="/chat-ai/training" className={tabNavClass}>
                          Bank Q&amp;A
                        </NavLink>
                      ) : null}
                      {pageTrainingChat ? (
                        <NavLink to="/chat-ai/training-chat" className={tabNavClass}>
                          Training Chat
                        </NavLink>
                      ) : null}
                      {pageDashboard ? (
                        <NavLink to="/chat-ai/dashboard" className={tabNavClass}>
                          Dashboard
                        </NavLink>
                      ) : null}
                      {pageRiwayat ? (
                        <NavLink to="/chat-ai/riwayat" className={tabNavClass}>
                          Riwayat
                        </NavLink>
                      ) : null}
                      {pagePengaturan ? (
                        <NavLink to="/chat-ai/pengaturan" className={tabNavClass}>
                          Pengaturan
                        </NavLink>
                      ) : null}
                      {uiUserAiSettings ? (
                        <NavLink to="/chat-ai/user-ai" className={tabNavClass}>
                          User AI
                        </NavLink>
                      ) : null}
                    </nav>
                    </div>
                  </div>
                ) : null}
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ minHeight: 0 }}>
                  <Outlet />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </ChatAiChromeProvider>
  )
}
