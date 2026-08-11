import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../../store/authStore'
import { getHomePathForAccess, listAvailableAccessModes } from '../../config/accessMode'
import { useTheme } from '../../contexts/ThemeContext'
import { useHtmlDarkClass } from '../../hooks/useHtmlDarkClass'
import AuthLeftPanel from './AuthLeftPanel'
import AuthDaftarModeToggle, { isAuthModeToggleRoute } from './AuthDaftarModeToggle'
import AuthPwaInstallButton from './AuthPwaInstallButton'
import { authPageFlipVariants, authPageFlipStyle } from '../../utils/authPageTransition'

/** Lebar panel kanan auth (login/daftar) desktop — selaras tombol tema di garis pemisah */
export const AUTH_RIGHT_PANEL_WIDTH_CLASS = 'md:w-[480px]'

const authControlsPillDesktopClass =
  'flex flex-col items-center gap-2 p-2 rounded-full bg-white/95 dark:bg-gray-800/95 backdrop-blur-md shadow-lg border border-gray-200/60 dark:border-gray-600/60'

/**
 * Layout auth publik: panel kiri + kontrol tema tetap; isi kanan dari &lt;Outlet /&gt; (login / daftar).
 * Satu instance layout saat pindah rute sehingga sisi kiri tidak remount — selaras pola eBeddien.
 */
function AuthLayoutShell() {
  const location = useLocation()
  const { toggleTheme } = useTheme()
  const isDark = useHtmlDarkClass()
  const showDaftarModeToggle = isAuthModeToggleRoute(location.pathname)
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!isMobile) return undefined
    document.documentElement.classList.add('auth-viewport-lock')
    return () => document.documentElement.classList.remove('auth-viewport-lock')
  }, [isMobile])

  return (
    <div className="w-full h-dvh max-h-dvh flex relative overflow-hidden md:min-h-screen md:h-auto md:max-h-none md:overflow-hidden">
      <AuthLeftPanel />

      <motion.div
        className={`relative w-full ${AUTH_RIGHT_PANEL_WIDTH_CLASS} md:shrink-0 md:flex-none flex flex-1 min-h-0 flex-col justify-start md:justify-center pt-[max(0.5rem,env(safe-area-inset-top))] md:pt-0 px-4 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:pb-8 md:px-10 z-10 login-bg-gradient overflow-y-auto overscroll-y-contain md:overflow-visible`}
        style={isMobile ? undefined : { perspective: '1400px' }}
      >
        <motion.div
          className={`hidden md:flex absolute left-0 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 ${authControlsPillDesktopClass}`}
        >
          {showDaftarModeToggle ? <AuthDaftarModeToggle /> : null}
          {showDaftarModeToggle ? (
            <div className="w-6 h-px bg-gray-200 dark:bg-gray-600 shrink-0" aria-hidden />
          ) : null}
          <AuthPwaInstallButton variant="icon" />
          <motion.button
            type="button"
            onClick={toggleTheme}
            className="flex items-center justify-center w-10 h-10 rounded-full text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700/80 transition-colors"
            style={{ perspective: '120px' }}
            whileTap={{ scale: 0.92 }}
            aria-label={isDark ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}
            title={isDark ? 'Mode terang' : 'Mode gelap'}
          >
            <span className="relative w-5 h-5 block">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={isDark ? 'dark' : 'light'}
                  className="absolute inset-0 flex items-center justify-center"
                  initial={{ rotateY: -90, opacity: 0 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  exit={{ rotateY: 90, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                  style={{ transformStyle: 'preserve-3d' }}
                >
                  {isDark ? (
                    <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                  )}
                </motion.span>
              </AnimatePresence>
            </span>
          </motion.button>
        </motion.div>

        {isMobile ? (
          <motion.div className="w-full flex justify-center shrink-0">
            <Outlet />
          </motion.div>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              variants={authPageFlipVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              style={authPageFlipStyle}
              className="w-full flex justify-center"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        )}
      </motion.div>

      <motion.div className="md:hidden fixed bottom-6 left-0 right-0 flex flex-row items-end justify-center gap-6 sm:gap-8 z-40 px-4">
        {showDaftarModeToggle ? <AuthDaftarModeToggle showLabel layout="horizontal" /> : null}
        <AuthPwaInstallButton variant="bar" />
        <motion.button
          type="button"
          onClick={toggleTheme}
          className="flex flex-col items-center justify-center gap-0.5 min-w-[52px] text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 active:opacity-80"
          style={{ perspective: '140px' }}
          whileTap={{ scale: 0.96 }}
          aria-label={isDark ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}
        >
          <span className="relative w-7 h-7 block">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={isDark ? 'dark' : 'light'}
                className="absolute inset-0 flex items-center justify-center"
                initial={{ rotateY: -90, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                exit={{ rotateY: 90, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                style={{ transformStyle: 'preserve-3d' }}
              >
                {isDark ? (
                  <svg className="w-7 h-7 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </motion.span>
            </AnimatePresence>
          </span>
          <span className="text-[10px] font-medium leading-tight">Tema</span>
        </motion.button>
      </motion.div>
    </div>
  )
}

export default function AuthPagesWrapper() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const user = useAuthStore((s) => s.user)
  const activeAccess = useAuthStore((s) => s.activeAccess)

  if (isAuthenticated) {
    const modes = listAvailableAccessModes(user)
    if (modes.length > 1 && activeAccess == null) {
      return <Navigate to="/pilih-akses" replace state={{ forcePick: true }} />
    }
    if (activeAccess) {
      return <Navigate to={getHomePathForAccess(activeAccess)} replace />
    }
    return <Navigate to="/" replace />
  }
  return <AuthLayoutShell />
}
