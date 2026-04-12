import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useChatOffcanvas } from '../../contexts/ChatOffcanvasContext'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import Chat from '../../pages/MyWorkspace/Chat/index.jsx'

/**
 * Panel kanan: daftar percakapan + ruang chat.
 * Tanpa MemoryRouter — Chat memakai state query internal saat variant=offcanvas (tidak boleh Router di dalam Router).
 */
export default function ChatOffcanvasHost() {
  const { isOpen, close } = useChatOffcanvas()
  const closeWithBack = useOffcanvasBackClose(isOpen, close, { state: { ebOffcanvas: 'chat' } })

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
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, close])

  return (
    <AnimatePresence>
      {isOpen ? (
        <>
          <motion.div
            key="chat-offcanvas-backdrop"
            role="presentation"
            className="fixed inset-0 z-[218] cursor-pointer bg-black/50 dark:bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeWithBack}
          />
          <motion.div
            key="chat-offcanvas-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Chat"
            className="fixed top-0 right-0 bottom-0 z-[219] flex w-full max-w-sm flex-col bg-gray-100 shadow-2xl dark:bg-gray-900"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <div className="flex min-h-0 flex-1 flex-col pt-[env(safe-area-inset-top,0px)]">
              <Chat variant="offcanvas" onRequestClose={closeWithBack} />
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  )
}
