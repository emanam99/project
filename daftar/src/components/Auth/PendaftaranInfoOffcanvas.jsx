import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * Offcanvas info jenjang pendaftaran — mobile dari bawah, desktop dari kiri (pola eBeddien / kalender).
 */
export default function PendaftaranInfoOffcanvas({ open, onClose, isMd }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="pendaftaran-info-backdrop"
            className="fixed inset-0 bg-black/50 z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            key="pendaftaran-info-panel"
            className="fixed z-[61] flex flex-col bg-white dark:bg-gray-900 shadow-2xl overflow-hidden md:left-0 md:top-0 md:bottom-0 md:w-full md:max-w-md md:rounded-r-2xl md:rounded-t-none left-0 right-0 bottom-0 rounded-t-3xl"
            style={isMd ? { width: 'min(100%, 28rem)' } : { height: '90vh', maxHeight: '90vh' }}
            initial={isMd ? { x: '-100%' } : { y: '100%' }}
            animate={isMd ? { x: 0 } : { y: 0 }}
            exit={isMd ? { x: '-100%' } : { y: '100%' }}
            transition={{ type: 'tween', duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label="Info pendaftaran"
          >
            <div className="hidden md:flex flex-shrink-0 items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
              <span className="font-semibold text-gray-800 dark:text-gray-100">Info pendaftaran</span>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-teal-600 dark:hover:text-teal-400"
                aria-label="Tutup"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-shrink-0 relative h-10 overflow-hidden bg-white dark:bg-gray-900 text-white dark:text-gray-900 md:hidden">
              <svg
                className="absolute left-0 top-0 w-[200%] h-full offcanvas-wave-svg"
                viewBox="0 0 800 40"
                preserveAspectRatio="none"
                aria-hidden
              >
                <path
                  fill="currentColor"
                  d="M 0,40 L 800,40 L 800,20 C 750,32 650,8 600,20 C 550,32 450,8 400,20 C 350,32 250,8 200,20 C 150,32 50,8 0,20 Z"
                />
              </svg>
            </div>
            <div className="md:hidden px-4 pt-2 pb-1 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
              <h2 className="text-center text-base font-semibold text-gray-800 dark:text-gray-100">Info pendaftaran</h2>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 md:py-5 text-sm text-gray-700 dark:text-gray-300">
              <p className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                Pendaftaran: satu link untuk semua jenjang.
              </p>
              <ul className="list-disc pl-5 space-y-1 mb-5">
                <li>Santri Baru</li>
              </ul>

              <p className="font-medium text-gray-800 dark:text-gray-200 mb-1.5">Pendaftaran Diniyah</p>
              <ul className="list-disc pl-5 space-y-0.5 mb-5">
                <li>Ula</li>
                <li>Wustha</li>
                <li>Ulya</li>
              </ul>

              <p className="font-medium text-gray-800 dark:text-gray-200 mb-1.5">Pendaftaran Formal</p>
              <ul className="list-disc pl-5 space-y-0.5 mb-5">
                <li>PAUD</li>
                <li>MTs</li>
                <li>SMP</li>
                <li>SMAI</li>
                <li>STAI</li>
              </ul>

              <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-400 pt-3 border-t border-gray-200 dark:border-gray-700">
                Pendaftaran diniyah / formal bagi santri yang sudah aktif di Pesantren Salafiyah Al-Utsmani, dan ingin
                daftar jenjang selanjutnya.
              </p>
            </div>

            <div className="flex-shrink-0 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50">
              <a
                href="https://pendaftaran.alutsmani.id"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-sm font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:underline transition-colors"
              >
                <span>Info lebih lanjut</span>
                <svg className="w-4 h-4 shrink-0 opacity-90" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>

            <div className="flex-shrink-0 flex justify-center py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 md:hidden">
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-teal-600 dark:hover:text-teal-400"
                aria-label="Tutup"
              >
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
