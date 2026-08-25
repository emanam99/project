import { Link, useLocation, useOutlet } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { getGambarUrl } from '../../config/images'

const NAV = [
  { to: '/tentang', label: 'Tentang' },
  { to: '/info-aplikasi', label: 'Info aplikasi' },
  { to: '/version', label: 'Versi' },
]

const PAGE_META = {
  '/tentang': {
    title: 'Tentang',
    description:
      'Pusat operasional digital pesantren untuk pengurus: data santri, keuangan, PSB, UWABA, UGT, publik, hingga Aplikasi Mybeddian—dalam satu alur kerja yang disatukan.',
  },
  '/info-aplikasi': {
    title: 'Info aplikasi',
    description: 'Versi terpasang, ringkas penilaian, hak cipta, dan pengembang.',
  },
  '/version': {
    title: 'Catatan versi',
    description: 'Fitur baru, perbaikan, dan catatan rilis eBeddien dari server.',
  },
}

/**
 * Cangkang bersama Tentang / Info aplikasi / Versi — hero + tab tetap saat ganti rute;
 * hanya judul/deskripsi kecil di hero dan konten di bawah tab yang berganti.
 */
export default function TentangPageLayout() {
  const { pathname } = useLocation()
  const outlet = useOutlet()
  const meta = PAGE_META[pathname] || PAGE_META['/tentang']

  return (
    <div className="h-full min-h-0 flex flex-col overflow-y-auto overscroll-y-contain bg-gradient-to-b from-slate-100 via-white to-slate-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 text-gray-900 dark:text-gray-100">
      <header className="relative shrink-0 overflow-hidden">
        <div
          className="absolute inset-0 bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 dark:from-primary-800 dark:via-primary-900 dark:to-slate-900"
          aria-hidden
        />
        <div
          className="absolute inset-0 opacity-[0.35] bg-[radial-gradient(ellipse_85%_55%_at_50%_-15%,rgba(255,255,255,0.4),transparent)]"
          aria-hidden
        />
        <div className="absolute inset-0 login-panel-pattern opacity-[0.07] dark:opacity-[0.12]" aria-hidden />

        <div className="relative max-w-3xl mx-auto px-4 pt-10 pb-14 sm:pt-12 sm:pb-16 text-center">
          <div className="flex flex-col items-center gap-3 sm:gap-4 mb-6">
            <img
              src={getGambarUrl('/icon/ebeddienlogoputih.png')}
              alt=""
              width={160}
              height={160}
              decoding="async"
              className="h-16 sm:h-[4.5rem] w-auto object-contain drop-shadow-lg"
            />
            <img
              src={getGambarUrl('/icon/ebeddientextputih.png')}
              alt="eBeddien"
              width={220}
              height={72}
              decoding="async"
              className="h-9 sm:h-11 w-auto max-w-[min(240px,85vw)] object-contain object-center drop-shadow-md"
            />
          </div>
          <div className="min-h-[4.5rem] sm:min-h-[5rem]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                {meta.title ? (
                  <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight drop-shadow-sm">
                    {meta.title}
                  </h1>
                ) : null}
                {meta.description ? (
                  <p className="mt-2 text-sm sm:text-[0.9375rem] text-primary-100/95 max-w-xl mx-auto leading-relaxed">
                    {meta.description}
                  </p>
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </header>

      <div className="flex-1 w-full max-w-3xl mx-auto px-4 -mt-8 relative z-10 pb-10 sm:pb-12 max-sm:pb-[max(2.5rem,calc(1.25rem+env(safe-area-inset-bottom,0px)))]">
        <nav
          className="rounded-2xl border border-gray-200/90 dark:border-gray-500/50 bg-white/95 dark:bg-gray-800/95 shadow-lg shadow-primary-900/5 dark:shadow-black/40 backdrop-blur-md p-1.5 flex flex-wrap justify-center gap-1.5"
          aria-label="Navigasi tentang aplikasi"
        >
          {NAV.map(({ to, label }) => {
            const active = pathname === to
            return (
              <Link
                key={to}
                to={to}
                className="relative inline-flex rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
              >
                {active ? (
                  <motion.span
                    layoutId="tentang-nav-pill"
                    className="absolute inset-0 rounded-xl bg-primary-600 dark:bg-primary-500 shadow-md shadow-primary-600/25 dark:shadow-primary-900/50"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                ) : null}
                <span
                  className={`relative z-10 inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    active
                      ? 'text-white'
                      : 'text-gray-600 dark:text-gray-200 hover:bg-primary-50/90 dark:hover:bg-gray-700/80 hover:text-primary-700 dark:hover:text-primary-300'
                  }`}
                >
                  {label}
                </span>
              </Link>
            )
          })}
        </nav>

        <div className="mt-6 rounded-2xl border border-gray-200/80 dark:border-gray-600/70 bg-white/90 dark:bg-gray-800/95 shadow-md shadow-gray-900/5 dark:shadow-black/30 backdrop-blur-sm overflow-x-hidden">
          <motion.div
            key={pathname}
            role="region"
            aria-live="polite"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {outlet}
          </motion.div>
        </div>

        <p className="text-center mt-8 mb-2">
          <Link
            to="/"
            className="text-sm font-medium text-primary-600 dark:text-primary-300 hover:text-primary-700 dark:hover:text-primary-200 hover:underline underline-offset-2"
          >
            Kembali ke beranda
          </Link>
        </p>
      </div>
    </div>
  )
}
