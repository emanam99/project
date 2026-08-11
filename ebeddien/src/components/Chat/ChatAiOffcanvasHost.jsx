import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChatAiChromeProvider } from '../../contexts/ChatAiChromeContext'
import { useChatAiOffcanvas } from '../../contexts/ChatAiOffcanvasContext'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import { useAuthStore } from '../../store/authStore'
import { catalogMenuRowForPath } from '../../utils/menuCatalogNav'
import { STATIC_FALLBACK_MENU_CATALOG_ROWS } from '../../config/menuConfig'

const DeepseekChat = lazy(() => import('../../pages/MyWorkspace/DeepseekChat/index.jsx'))

const PANEL_MAX_WIDTH_REM = 24 // selaras max-w-sm (384px)

/**
 * Panel kanan: obrolan eBeddien dari header. Desktop: bisa dipin (konten utama bergeser ke kiri).
 */
export default function ChatAiOffcanvasHost() {
  const { isOpen, close, isPinned, togglePinned } = useChatAiOffcanvas()
  const closeWithBack = useOffcanvasBackClose(isOpen, close, { state: { ebOffcanvas: 'chat_ai' } })
  const location = useLocation()
  const fiturMenuCatalog = useAuthStore((s) => s.fiturMenuCatalog)
  const user = useAuthStore((s) => s.user)

  const [isLg, setIsLg] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const fn = () => setIsLg(mq.matches)
    fn()
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  const pinnedLayout = isOpen && isPinned && isLg

  useEffect(() => {
    if (!isOpen) return
    if (pinnedLayout) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen, pinnedLayout])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') closeWithBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, closeWithBack])

  const hostPageContext = useMemo(() => {
    const pathname = (location.pathname || '/').replace(/\/+$/, '') || '/'
    const row =
      catalogMenuRowForPath(fiturMenuCatalog, pathname) ||
      catalogMenuRowForPath(STATIC_FALLBACK_MENU_CATALOG_ROWS, pathname)
    const menuLabel =
      row?.label != null
        ? String(row.label).trim()
        : row?.title != null
          ? String(row.title).trim()
          : ''
    const rawGroup = row?.group_label ?? row?.groupLabel
    const headerGroup = rawGroup != null ? String(rawGroup).trim() : ''
    return {
      source: 'header_offcanvas',
      pathname,
      search: typeof location.search === 'string' ? location.search : '',
      menu_label: menuLabel || null,
      header_group: headerGroup || null,
      panel_pinned: Boolean(isPinned && isLg),
    }
  }, [location.pathname, location.search, fiturMenuCatalog, isPinned, isLg])

  return (
    <AnimatePresence>
      {isOpen ? (
        <>
          {!pinnedLayout ? (
            <motion.div
              key="chat-ai-offcanvas-backdrop"
              role="presentation"
              className="fixed inset-0 z-[220] cursor-pointer bg-black/50 dark:bg-black/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={closeWithBack}
            />
          ) : null}
          <motion.div
            key="chat-ai-offcanvas-panel"
            role="dialog"
            aria-modal="true"
            aria-label="eBeddien AI"
            className="fixed top-0 right-0 bottom-0 z-[221] flex w-full max-w-sm flex-col bg-gray-100 shadow-2xl dark:bg-gray-900"
            style={{ maxWidth: `${PANEL_MAX_WIDTH_REM}rem` }}
            initial={pinnedLayout ? false : { x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
              <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">eBeddien AI</span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  className={`hidden lg:inline-flex h-9 w-9 items-center justify-center rounded-lg border text-gray-600 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 ${
                    isPinned
                      ? 'border-primary-400 bg-primary-50 dark:border-primary-600 dark:bg-primary-950/50'
                      : 'border-gray-200 dark:border-gray-600'
                  }`}
                  onClick={togglePinned}
                  title={isPinned ? 'Lepas pin (panel mengambang)' : 'Pin panel — konten halaman bergeser ke kiri'}
                  aria-pressed={isPinned}
                  aria-label={isPinned ? 'Lepas pin panel' : 'Pin panel di kanan'}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 10.5c0 7.143-7.036 11.25-7.036 11.25a.75.75 0 01-1.464 0S4.5 17.643 4.5 10.5a7.5 7.5 0 1115 0z"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  onClick={closeWithBack}
                  aria-label="Tutup panel"
                >
                  <span className="text-lg leading-none" aria-hidden>
                    ×
                  </span>
                </button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col pt-[env(safe-area-inset-top,0px)]">
              <ChatAiChromeProvider showSectionTabs={false}>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" style={{ minHeight: 0 }}>
                    <Suspense
                      fallback={
                        <div className="flex flex-1 items-center justify-center text-gray-500 dark:text-gray-400">
                          Memuat eBeddien…
                        </div>
                      }
                    >
                      <DeepseekChat
                        variant="offcanvas"
                        hostPageContext={hostPageContext}
                        onRequestClose={closeWithBack}
                      />
                    </Suspense>
                  </div>
                </div>
              </ChatAiChromeProvider>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  )
}
