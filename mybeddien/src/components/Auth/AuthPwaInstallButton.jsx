import { motion } from 'framer-motion'
import { usePwaInstallPrompt } from '../../hooks/usePwaInstallPrompt'

const DownloadIcon = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v10m0 0l-4-4m4 4l4-4M5 19h14" />
  </svg>
)

/**
 * Tombol install PWA untuk halaman auth.
 * variant: card (di form), icon (pill desktop), bar (bottom mobile)
 */
export default function AuthPwaInstallButton({ variant = 'card', className = '' }) {
  const { canInstall, promptInstall } = usePwaInstallPrompt()
  if (!canInstall) return null

  const onClick = () => {
    void promptInstall()
  }

  if (variant === 'icon') {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        className={`flex items-center justify-center w-10 h-10 rounded-full text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700/80 transition-colors ${className}`}
        whileTap={{ scale: 0.92 }}
        aria-label="Install aplikasi myBeddien"
        title="Install aplikasi"
      >
        <DownloadIcon className="w-5 h-5" />
      </motion.button>
    )
  }

  if (variant === 'bar') {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        className={`flex flex-col items-center justify-center gap-0.5 min-w-[52px] text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 active:opacity-80 ${className}`}
        whileTap={{ scale: 0.96 }}
        aria-label="Install aplikasi myBeddien"
      >
        <DownloadIcon className="w-7 h-7" />
        <span className="text-[10px] font-medium leading-tight">Install</span>
      </motion.button>
    )
  }

  return (
    <motion.button
      type="button"
      onClick={onClick}
      className={`group w-full inline-flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl border border-gray-200/80 dark:border-gray-600/60 bg-white/90 dark:bg-gray-800/70 text-gray-800 dark:text-gray-100 text-sm font-semibold shadow-sm hover:border-primary-400 dark:hover:border-primary-500 hover:text-primary-700 dark:hover:text-primary-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary-500/30 transition-all ${className}`}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      aria-label="Install aplikasi myBeddien ke perangkat"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 group-hover:bg-primary-600 group-hover:text-white shadow-sm transition-colors">
        <DownloadIcon className="w-4 h-4" />
      </span>
      <span className="text-left leading-tight">
        <span className="block">Install aplikasi</span>
        <span className="block text-[11px] font-normal text-gray-500 dark:text-gray-400 group-hover:text-primary-600/80 dark:group-hover:text-primary-400/80">
          Akses lebih cepat dari layar utama
        </span>
      </span>
    </motion.button>
  )
}
