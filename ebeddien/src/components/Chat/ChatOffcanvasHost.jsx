import { Suspense, lazy, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useChatOffcanvas } from '../../contexts/ChatOffcanvasContext'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'

const Chat = lazy(() => import('../../pages/MyWorkspace/Chat/index.jsx'))

const PANEL_MAX_WIDTH_REM = 24 // selaras max-w-sm / Chat AI

/**
 * Panel kanan: daftar percakapan + ruang chat.
 * Desktop (lg): bisa dipin — konten utama bergeser seperti eBeddien AI.
 */
export default function ChatOffcanvasHost() {
  const { isOpen, close, isPinned, togglePinned } = useChatOffcanvas()
  const closeWithBack = useOffcanvasBackClose(isOpen, close, { state: { ebOffcanvas: 'chat' } })
  /** Tetap mount Chat setelah pertama dibuka — hindari lazy remount & kedip saat buka lagi */
  const [chatMounted, setChatMounted] = useState(false)

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
    if (isOpen) setChatMounted(true)
  }, [isOpen])

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

  if (!isOpen && !chatMounted) return null

  return (
    <>
      <AnimatePresence>
        {isOpen && !pinnedLayout ? (
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
        ) : null}
      </AnimatePresence>
      <motion.div
        role="dialog"
        aria-modal={isOpen}
        aria-hidden={!isOpen}
        aria-label="Chat"
        className="fixed top-0 right-0 bottom-0 z-[219] flex w-full max-w-sm flex-col bg-gray-100 shadow-2xl dark:bg-gray-900"
        style={{
          maxWidth: `${PANEL_MAX_WIDTH_REM}rem`,
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
        initial={false}
        animate={{ x: isOpen ? 0 : '100%' }}
        transition={{ type: 'tween', duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <motion.div className="flex min-h-0 flex-1 flex-col pt-[env(safe-area-inset-top,0px)]" initial={false}>
          <Suspense
            fallback={(
              <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                Memuat chat...
              </div>
            )}
          >
            <Chat
              variant="offcanvas"
              onRequestClose={closeWithBack}
              offcanvasIsPinned={isPinned}
              onToggleOffcanvasPinned={togglePinned}
            />
          </Suspense>
        </motion.div>
      </motion.div>
    </>
  )
}
