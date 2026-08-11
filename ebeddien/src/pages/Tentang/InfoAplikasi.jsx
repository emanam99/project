import { motion } from 'framer-motion'
import { APP_VERSION } from '../../config/version'
import TentangPageLayout from './TentangPageLayout'

const APP_NAME = 'eBeddien'
const APP_SUBTITLE = 'Digital Service Center'
const DEVELOPER = 'Beddian IT'
const currentYear = new Date().getFullYear()

/** Indikator visibilitas tinggi di mode gelap & terang. */
function StarRow({ filled = 4, partial = 0.9 }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-1" aria-hidden>
        {Array.from({ length: filled }, (_, i) => (
          <svg key={`f-${i}`} className="w-7 h-7 text-amber-400 dark:text-amber-300 drop-shadow-sm" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        ))}
        <span className="relative w-7 h-7 inline-flex items-center justify-center">
          <svg className="w-7 h-7 text-gray-300 dark:text-gray-600 absolute" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          <svg
            className="w-7 h-7 text-amber-400 dark:text-amber-300 absolute overflow-hidden drop-shadow-sm"
            fill="currentColor"
            viewBox="0 0 24 24"
            style={{ clipPath: `inset(0 ${(1 - partial) * 100}% 0 0)` }}
          >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </span>
      </div>
      <p className="text-lg font-semibold text-gray-900 dark:text-white tabular-nums">
        4,9 <span className="text-sm font-normal text-gray-600 dark:text-gray-300">/ 5</span>
      </p>
      <p className="text-xs text-gray-600 dark:text-gray-300 max-w-xs text-center leading-snug">
        Indikasi kepuasan pengguna internal (survey singkat pengurus). Bukan skor toko aplikasi.
      </p>
    </div>
  )
}

export default function InfoAplikasi() {
  return (
    <TentangPageLayout title="Info aplikasi" description="Versi terpasang, ringkas penilaian, hak cipta, dan pengembang.">
      <div className="p-6 sm:p-8 text-center space-y-8">
        <div>
          <p className="text-base font-semibold text-gray-900 dark:text-white">{APP_NAME}</p>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{APP_SUBTITLE}</p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary-50 dark:bg-primary-950/70 text-primary-900 dark:text-primary-100 px-4 py-2 text-sm font-mono font-medium border border-primary-200/80 dark:border-primary-600/50">
            Versi {APP_VERSION}
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.08, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl border border-amber-200/90 dark:border-amber-600/45 bg-amber-50/70 dark:bg-amber-950/50 px-5 py-6"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200 mb-3">Rating</p>
          <StarRow />
        </motion.div>

        <div className="pt-6 border-t border-gray-200 dark:border-gray-600">
          <p className="text-sm text-gray-600 dark:text-gray-300">© {currentYear}</p>
          <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{DEVELOPER}</p>
        </div>
      </div>
    </TentangPageLayout>
  )
}
