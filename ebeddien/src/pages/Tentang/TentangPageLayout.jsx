import { Link, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { getGambarUrl } from '../../config/images'

const NAV = [
  { to: '/tentang', label: 'Tentang' },
  { to: '/info-aplikasi', label: 'Info aplikasi' },
  { to: '/version', label: 'Versi' },
]

/**
 * Cangkang bersama halaman Tentang / Info aplikasi / Versi — hero + logo putih selaras sidebar & login.
 * Wadah full-page dengan scroll vertikal (min-h-dvh + overflow-y-auto) agar konten panjang tidak terpotong.
 */
export default function TentangPageLayout({ title, description, children }) {
  const { pathname } = useLocation()

  return (
    <div className="min-h-dvh flex flex-col overflow-y-auto overscroll-y-contain bg-gradient-to-b from-slate-100 via-white to-slate-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 text-gray-900 dark:text-gray-100">
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
          {title ? (
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight drop-shadow-sm">{title}</h1>
          ) : null}
          {description ? (
            <p className="mt-2 text-sm sm:text-[0.9375rem] text-primary-100/95 max-w-xl mx-auto leading-relaxed">
              {description}
            </p>
          ) : null}
        </div>
      </header>

      <div className="flex-1 w-full max-w-3xl mx-auto px-4 -mt-8 relative z-10 pb-16 sm:pb-24">
        <nav
          className="rounded-2xl border border-gray-200/90 dark:border-gray-500/50 bg-white/95 dark:bg-gray-800/95 shadow-lg shadow-primary-900/5 dark:shadow-black/40 backdrop-blur-md p-1.5 flex flex-wrap justify-center gap-1.5"
          aria-label="Navigasi tentang aplikasi"
        >
          {NAV.map(({ to, label }) => {
            const active = pathname === to
            return (
              <Link key={to} to={to} className="relative inline-flex rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900">
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
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              role="region"
              aria-live="polite"
              initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -12, filter: 'blur(4px)' }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>

        <p className="text-center mt-8">
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
