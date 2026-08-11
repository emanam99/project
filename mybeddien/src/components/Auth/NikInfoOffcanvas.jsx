import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import { DAFTAR_INFO_NIK_IMAGE, getGambarUrl } from '../../config/images'

const nikImageSrc = getGambarUrl(DAFTAR_INFO_NIK_IMAGE)

/**
 * Offcanvas bawah: informasi NIK — konten & gambar selaras aplikasi daftar (InfoModal field nik).
 */
export default function NikInfoOffcanvas({ isOpen, onClose }) {
  const handleClose = useOffcanvasBackClose(isOpen, onClose)

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, handleClose])

  if (!isOpen) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="nik-info-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-[100]"
        onClick={handleClose}
        aria-hidden
      />
      <motion.div
        key="nik-info-panel"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-[101] flex flex-col bg-white dark:bg-gray-800 rounded-t-2xl shadow-2xl max-h-[min(90vh,720px)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nik-info-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600 mx-auto mt-3 shrink-0" aria-hidden />

        <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0 border-b border-gray-100 dark:border-gray-700">
          <h2 id="nik-info-title" className="text-lg font-semibold text-gray-800 dark:text-white">
            Informasi NIK
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Tutup"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4">
          <img
            src={nikImageSrc}
            alt="Contoh NIK di KTP/KK"
            className="w-full h-auto rounded-lg shadow-sm"
          />
          <div className="mt-4">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
              <b>NIK (Nomor Induk Kependudukan)</b> adalah nomor identitas tunggal yang diberikan kepada setiap
              penduduk Indonesia. NIK tercantum dalam Kartu Tanda Penduduk (KTP) dan bersifat unik, berlaku seumur
              hidup, dan tidak berubah meskipun pindah domisili.
            </p>
            <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg p-3">
              <p className="text-xs font-semibold text-teal-800 dark:text-teal-200 mb-1">Contoh NIK:</p>
              <p className="text-sm text-teal-700 dark:text-teal-300 font-mono">3201010101010001</p>
              <p className="text-xs text-teal-600 dark:text-teal-400 mt-2">
                NIK terdiri dari 16 digit angka yang dapat ditemukan di:
              </p>
              <ul className="text-xs text-teal-600 dark:text-teal-400 mt-1 list-disc list-inside space-y-1">
                <li>Kartu Tanda Penduduk (KTP)</li>
                <li>Kartu Keluarga (KK)</li>
                <li>Dokumen kependudukan lainnya</li>
              </ul>
              <p className="text-xs text-teal-600 dark:text-teal-400 mt-2">
                Pastikan yang dimasukkan adalah <b>NIK santri</b> yang mau mendaftar, sesuai dengan Kartu Keluarga
                (KK).
              </p>
            </div>
          </div>
        </div>

        <div className="shrink-0 p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
          <button
            type="button"
            onClick={handleClose}
            className="w-full py-3 rounded-xl font-medium text-white bg-teal-600 hover:bg-teal-700 transition-colors"
          >
            Mengerti
          </button>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}
