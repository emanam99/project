import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getGambarUrl } from '@/config/images'

const STORAGE_KEY = 'mybeddian_pwa_install_dismissed'
const SHOW_AFTER_MS = 4000 // Tampilkan banner setelah 4 detik jika belum dismiss (fallback saat beforeinstallprompt tidak fire)

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showBanner, setShowBanner] = useState(false)
  const [isInstalling, setIsInstalling] = useState(false)
  const [iconError, setIconError] = useState(false)
  const [showManualHint, setShowManualHint] = useState(false)
  const fallbackTimer = useRef(null)

  const isStandalone = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
  const wasDismissed = typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY)

  useEffect(() => {
    if (isStandalone || wasDismissed) return

    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowBanner(true)
      if (fallbackTimer.current) {
        clearTimeout(fallbackTimer.current)
        fallbackTimer.current = null
      }
    }
    window.addEventListener('beforeinstallprompt', handler)

    // Fallback: tampilkan banner setelah beberapa detik agar popup tetap muncul
    // (beforeinstallprompt tidak selalu fire, mis. di dev atau kebijakan browser)
    fallbackTimer.current = setTimeout(() => {
      fallbackTimer.current = null
      setShowBanner(true)
    }, SHOW_AFTER_MS)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current)
    }
  }, [isStandalone, wasDismissed])

  useEffect(() => {
    if (isStandalone) setShowBanner(false)
  }, [isStandalone])

  const handleInstall = async () => {
    if (deferredPrompt) {
      setIsInstalling(true)
      try {
        deferredPrompt.prompt()
        const { outcome } = await deferredPrompt.userChoice
        if (outcome === 'accepted') setShowBanner(false)
      } finally {
        setIsInstalling(false)
      }
    } else {
      // Browser tidak mengirim beforeinstallprompt (mis. di localhost dev) — tunjukkan cara manual
      setShowManualHint(true)
    }
  }

  const handleDismiss = () => {
    setShowBanner(false)
    setShowManualHint(false)
    try {
      localStorage.setItem(STORAGE_KEY, Date.now().toString())
    } catch (_) {}
  }

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="fixed bottom-20 left-4 right-4 md:left-auto md:right-6 md:max-w-sm z-50"
        >
          <div className="rounded-2xl shadow-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 overflow-hidden">
            <div className="p-4 flex items-start gap-3">
              <div className="shrink-0 w-12 h-12 rounded-xl bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center overflow-hidden">
                {!iconError ? (
                  <img
                    src={getGambarUrl('icon/mybeddien.png')}
                    alt="myBeddien"
                    className="w-10 h-10 object-contain"
                    onError={() => setIconError(true)}
                  />
                ) : (
                  <span className="w-10 h-10 rounded-full bg-teal-500 flex items-center justify-center text-white font-bold text-sm">M</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Pasang Aplikasi</h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                  Pasang myBeddien di layar utama untuk akses lebih cepat dan pengalaman seperti aplikasi native.
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    type="button"
                    onClick={handleInstall}
                    disabled={isInstalling}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-70 transition-colors"
                  >
                    {isInstalling ? 'Memasang…' : 'Pasang'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDismiss}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    Nanti
                  </button>
                </div>
                {showManualHint && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                    Di Chrome: menu ⋮ → &quot;Install myBeddien&quot; atau &quot;Pasang aplikasi&quot;. Di Safari (iPhone): tombol Bagikan → &quot;Tambahkan ke Layar Utama&quot;.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleDismiss}
                aria-label="Tutup"
                className="shrink-0 p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
