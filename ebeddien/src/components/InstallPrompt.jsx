import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePwaInstallPrompt } from '../hooks/usePwaInstallPrompt'

function InstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false)
  const { canInstall, installed, promptInstall } = usePwaInstallPrompt()

  useEffect(() => {
    if (!canInstall) {
      setShowPrompt(false)
      return undefined
    }
    const promptTimer = window.setTimeout(() => {
      setShowPrompt(true)
    }, 3000)
    return () => {
      window.clearTimeout(promptTimer)
    }
  }, [canInstall])

  const handleInstallClick = async () => {
    const accepted = await promptInstall()
    if (accepted) {
      setShowPrompt(false)
    }
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    // Hide for this session
    sessionStorage.setItem('installPromptDismissed', 'true')
  }

  // Don't show if already installed or dismissed in this session
  if (installed || !showPrompt || !canInstall || sessionStorage.getItem('installPromptDismissed')) {
    return null
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -100, opacity: 0 }}
        className="fixed top-0 left-0 right-0 z-50 bg-primary-600 dark:bg-primary-800 text-white shadow-lg"
      >
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-semibold">Install Aplikasi eBeddien</p>
              <p className="text-xs text-white/80">Akses lebih cepat dan mudah tanpa browser</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleInstallClick}
              className="px-4 py-2 bg-white text-primary-600 rounded-lg font-semibold text-sm hover:bg-gray-100 transition-colors shadow-md"
            >
              Install
            </button>
            <button
              onClick={handleDismiss}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              aria-label="Tutup"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

export default InstallPrompt

