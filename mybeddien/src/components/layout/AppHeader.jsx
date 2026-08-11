import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../../store/authStore'
import { useTheme } from '../../contexts/ThemeContext'
import { getRouteHeaderMeta } from '../../config/routeMeta'
import HeaderRouteIcon from './HeaderRouteIcon'
import { APP_VERSION } from '../../config/version'
import { profilAPI } from '../../services/api'
import { useActiveAccessDisplayName } from '../../hooks/useActiveAccessDisplayName'
import { ensureHijriTodayFetched, fetchKalenderToday, readTodayPenanggalanSync } from '../../utils/hijriPenanggalan'
import { usePwaInstallPrompt } from '../../hooks/usePwaInstallPrompt'

/**
 * Preferensi reduced motion lewat matchMedia (bukan useReducedMotion Framer) agar tidak memicu
 * console warning troubleshooting/reduced-motion-disabled saat pengguna memang mengaktifkan aksesibilitas.
 */
function usePrefersReducedMotionSafe() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    setReduced(mq.matches)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/** Grup menu: hanya animasi saat teks grup berubah (bukan tiap pindah halaman dalam grup) */
const groupChangeVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, ease: [0.25, 1, 0.5, 1] },
  },
  leave: {
    opacity: 0,
    y: -4,
    transition: { duration: 0.16, ease: [0.4, 0, 0.6, 1] },
  },
}

export default function AppHeader() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout, patchUser } = useAuthStore()
  const { displayName, initial } = useActiveAccessDisplayName()
  const { theme, toggleTheme } = useTheme()
  const { canInstall, promptInstall } = usePwaInstallPrompt()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  const [hijriYmd, setHijriYmd] = useState(() => readTodayPenanggalanSync()?.hijriyah ?? null)
  const [masehiYmd, setMasehiYmd] = useState(() => readTodayPenanggalanSync()?.masehi ?? null)
  const [photoUrl, setPhotoUrl] = useState(null)
  const photoUrlRef = useRef(null)

  const prefersReducedMotion = usePrefersReducedMotionSafe()

  const { group, title, icon: routeIcon } = getRouteHeaderMeta(location.pathname)
  useEffect(() => {
    let cancelled = false
    ensureHijriTodayFetched().then((row) => {
      if (!cancelled && row?.masehi) {
        setMasehiYmd(row.masehi)
        if (row.hijriyah) setHijriYmd(row.hijriyah)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!user?.id) return
    const fotoPath = user?.foto_profil
    if (!fotoPath) {
      setPhotoUrl(null)
      return undefined
    }
    let cancelled = false
    profilAPI.getProfilFotoBlob(fotoPath).then((blob) => {
      if (cancelled) return
      if (blob instanceof Blob) {
        if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current)
        const url = URL.createObjectURL(blob)
        photoUrlRef.current = url
        setPhotoUrl(url)
      } else {
        setPhotoUrl(null)
        if (fotoPath) patchUser({ foto_profil: null })
      }
    }).catch(() => {
      if (!cancelled) {
        setPhotoUrl(null)
        if (fotoPath) patchUser({ foto_profil: null })
      }
    })
    return () => {
      cancelled = true
      if (photoUrlRef.current) {
        URL.revokeObjectURL(photoUrlRef.current)
        photoUrlRef.current = null
      }
      setPhotoUrl(null)
    }
  }, [user?.id, user?.foto_profil])

  const refreshPenanggalan = async () => {
    const r = await fetchKalenderToday()
    if (r.masehi) setMasehiYmd(String(r.masehi).slice(0, 10))
    setHijriYmd(r.hijriyah && r.hijriyah !== '-' ? String(r.hijriyah).slice(0, 10) : null)
  }

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="relative z-50 shrink-0 border-b border-gray-200/80 dark:border-gray-700/80 bg-white/88 dark:bg-gray-900/82 backdrop-blur-lg shadow-sm">
      <div className="flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 min-h-13">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
          {/* Ikon halaman aktif (HP & desktop) */}
          <div className="relative flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 overflow-hidden rounded-xl bg-linear-to-br from-primary-600 to-primary-800 shadow-md ring-1 ring-white/25 dark:ring-gray-900/40 items-center justify-center text-white">
            <HeaderRouteIcon name={routeIcon} className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <div className="min-w-0 flex-1 overflow-hidden pt-1 pb-0.5 -my-1">
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={group}
                className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-primary-600 dark:text-primary-400 truncate will-change-transform"
                {...(prefersReducedMotion
                  ? {
                      initial: { opacity: 0 },
                      animate: { opacity: 1 },
                      exit: { opacity: 0 },
                      transition: { duration: 0.15 },
                    }
                  : {
                      variants: groupChangeVariants,
                      initial: 'hidden',
                      animate: 'visible',
                      exit: 'leave',
                    })}
              >
                {group}
              </motion.p>
            </AnimatePresence>

            <div className="relative overflow-hidden min-h-5 sm:min-h-7">
              <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white tracking-tight truncate leading-tight">
                {title}
              </h1>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canInstall && (
            <button
              type="button"
              onClick={() => void promptInstall()}
              className="inline-flex h-9 sm:h-10 items-center justify-center gap-1.5 px-2.5 sm:px-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold shadow-sm transition-colors"
              title="Install aplikasi myBeddien"
              aria-label="Install aplikasi myBeddien"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v10m0 0l-4-4m4 4l4-4M5 19h14" />
              </svg>
              <span>Install</span>
            </button>
          )}
          <div className="relative z-100" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="relative w-11 h-11 rounded-full bg-primary-500/10 dark:bg-primary-400/10 flex items-center justify-center cursor-pointer shadow-lg border-2 border-gray-200 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-500 transition-colors overflow-visible shrink-0"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label="Menu akun"
            >
              <span className="absolute inset-0 rounded-full overflow-hidden flex items-center justify-center">
                {photoUrl ? (
                  <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-lg font-semibold text-primary-600 dark:text-primary-400">{initial}</span>
                )}
              </span>
            </button>

            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className="absolute right-0 top-full mt-2 z-110 w-64 rounded-lg border border-gray-200 bg-white py-2 text-gray-700 shadow-xl dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 max-h-[calc(100vh-120px)] overflow-y-auto overscroll-contain"
                  role="menu"
                >
                  <div className="flex flex-col items-center px-4 pt-4 pb-3 border-b dark:border-gray-700">
                    <div className="w-16 h-16 rounded-full bg-primary-500/10 dark:bg-primary-400/10 flex items-center justify-center mb-2 border border-gray-200 dark:border-gray-600 overflow-hidden shrink-0">
                      {photoUrl ? (
                        <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl font-semibold text-primary-600 dark:text-primary-400">{initial}</span>
                      )}
                    </div>
                    <div className="font-semibold text-gray-800 dark:text-gray-200 text-base">{displayName}</div>
                    {user?.username ? (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">@{user.username}</div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    onClick={() => {
                      setMenuOpen(false)
                      navigate('/')
                    }}
                  >
                    <HeaderRouteIcon name="home" className="w-5 h-5 text-gray-400" />
                    Beranda
                  </button>

                  <button
                    type="button"
                    className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    onClick={() => {
                      setMenuOpen(false)
                      navigate('/profil')
                    }}
                  >
                    <HeaderRouteIcon name="profil" className="w-5 h-5 text-gray-400" />
                    Profil
                  </button>

                  <div className="w-full text-left px-4 py-2 flex items-center gap-2">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                    <span className="flex-1">Tema</span>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={theme === 'dark'}
                        onChange={toggleTheme}
                        className="sr-only"
                      />
                      <span
                        className={`w-10 h-6 flex items-center rounded-full p-1 duration-300 ${
                          theme === 'dark' ? 'bg-primary-600' : 'bg-gray-200'
                        }`}
                      >
                        <motion.span
                          animate={{ x: theme === 'dark' ? 16 : 0 }}
                          className="bg-white w-4 h-4 rounded-full shadow-md transform duration-300"
                        />
                      </span>
                    </label>
                  </div>

                  <div className="border-t border-gray-200 dark:border-gray-700 my-1" />

                  <button
                    type="button"
                    className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-red-600 dark:text-red-400 flex items-center gap-2"
                    onClick={handleLogout}
                  >
                    <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2h4a2 2 0 012 2v1" />
                    </svg>
                    Keluar
                  </button>

                  {/* Versi & Tanggal — selaras eBeddien (di bawah, setelah Keluar) */}
                  <div className="w-full flex flex-col items-center mt-4 mb-2 px-4">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => void refreshPenanggalan()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          void refreshPenanggalan()
                        }
                      }}
                      className="flex flex-row items-center justify-between bg-white dark:bg-gray-700 rounded-xl px-4 py-3 border dark:border-gray-600 border-gray-200 shadow-md gap-4 transition hover:shadow-lg w-full cursor-pointer"
                      title="Klik untuk refresh tanggal"
                    >
                      <div className="flex flex-col items-center">
                        <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7a1 1 0 011-1h8a1 1 0 011 1v8a1 1 0 01-1 1H8a1 1 0 01-1-1V7z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7l10 10" />
                          </svg>
                          Versi
                        </span>
                        <span className="font-mono text-base text-gray-800 dark:text-gray-200">{APP_VERSION}</span>
                      </div>
                      <div className="flex flex-col items-center border-l dark:border-gray-600 border-gray-200 pl-4">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          <motion.span
                            key={masehiYmd || 'm'}
                            initial={{ opacity: 0.45, y: -3 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2 }}
                            className="font-mono text-xs text-gray-800 dark:text-gray-200"
                          >
                            {masehiYmd || '\u00A0'}
                          </motion.span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <svg className="w-4 h-4 text-yellow-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z" />
                          </svg>
                          <motion.span
                            key={hijriYmd || 'h'}
                            initial={{ opacity: 0.45, y: -3 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2 }}
                            className="font-mono text-xs text-gray-800 dark:text-gray-200"
                          >
                            {hijriYmd || '\u00A0'}
                          </motion.span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  )
}
