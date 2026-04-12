import { Suspense, lazy, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChatAiChromeProvider } from '../../contexts/ChatAiChromeContext'
import { useChatAiOffcanvas } from '../../contexts/ChatAiOffcanvasContext'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'

const DeepseekChat = lazy(() => import('../../pages/MyWorkspace/DeepseekChat/index.jsx'))

/**
 * Panel kanan: obrolan eBeddien (mode utama / alternatif) seperti halaman /chat-ai,
 * tanpa MemoryRouter — sub-menu pelatihan memakai Link ke rute penuh lalu panel ditutup.
 */
export default function ChatAiOffcanvasHost() {
  const { isOpen, close } = useChatAiOffcanvas()
  const closeWithBack = useOffcanvasBackClose(isOpen, close, { state: { ebOffcanvas: 'chat_ai' } })

  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') closeWithBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, closeWithBack])

  return (
    <AnimatePresence>
      {isOpen ? (
        <>
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
          <motion.div
            key="chat-ai-offcanvas-panel"
            role="dialog"
            aria-modal="true"
            aria-label="eBeddien"
            className="fixed top-0 right-0 bottom-0 z-[221] flex w-full max-w-md flex-col bg-gray-100 shadow-2xl dark:bg-gray-900"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          >
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
                      <DeepseekChat variant="offcanvas" onRequestClose={closeWithBack} />
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
