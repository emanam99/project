import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

export function isDaftarAuthRoute(pathname) {
  return pathname === '/daftar' || pathname === '/daftar-pjgt' || pathname === '/daftar-toko'
}

export function isLupaUsernameAuthRoute(pathname) {
  return (
    pathname === '/lupa-username' ||
    pathname === '/lupa-username-pjgt' ||
    pathname === '/lupa-username-toko'
  )
}

export function isLupaPasswordAuthRoute(pathname) {
  return (
    pathname === '/lupa-password' ||
    pathname === '/lupa-password-pjgt' ||
    pathname === '/lupa-password-toko'
  )
}

/** Rute yang menampilkan toggle Santri / PJGT / Toko di layout auth. */
export function isAuthModeToggleRoute(pathname) {
  return (
    isDaftarAuthRoute(pathname) ||
    isLupaUsernameAuthRoute(pathname) ||
    isLupaPasswordAuthRoute(pathname)
  )
}

function modeBtnClass(active) {
  return [
    'flex flex-col items-center justify-center rounded-full transition-colors',
    active
      ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
      : 'text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700/80',
  ].join(' ')
}

function resolveModePaths(pathname) {
  if (isLupaUsernameAuthRoute(pathname)) {
    return {
      santri: '/lupa-username',
      pjgt: '/lupa-username-pjgt',
      toko: '/lupa-username-toko',
      labelSantri: 'Lupa username santri',
      labelPjgt: 'Lupa username PJGT',
      labelToko: 'Lupa username toko',
    }
  }
  if (isLupaPasswordAuthRoute(pathname)) {
    return {
      santri: '/lupa-password',
      pjgt: '/lupa-password-pjgt',
      toko: '/lupa-password-toko',
      labelSantri: 'Lupa password santri',
      labelPjgt: 'Lupa password PJGT',
      labelToko: 'Lupa password toko',
    }
  }
  return {
    santri: '/daftar',
    pjgt: '/daftar-pjgt',
    toko: '/daftar-toko',
    labelSantri: 'Daftar santri',
    labelPjgt: 'Daftar PJGT madrasah',
    labelToko: 'Daftar toko',
  }
}

/**
 * Tombol Santri ↔ PJGT ↔ Toko (daftar, lupa username, lupa password).
 */
export default function AuthDaftarModeToggle({ showLabel = false, layout = 'vertical' }) {
  const location = useLocation()
  const navigate = useNavigate()
  const path = location.pathname
  const paths = resolveModePaths(path)
  const isPjgt = path === paths.pjgt
  const isToko = path === paths.toko
  const isSantri = !isPjgt && !isToko
  const isHorizontal = layout === 'horizontal'
  const iconClass = showLabel ? 'w-7 h-7' : 'w-5 h-5'
  const btnClass = showLabel ? 'min-w-[52px] py-1 px-1' : 'w-10 h-10'

  const goSantri = () => {
    if (isSantri) return
    navigate(paths.santri)
  }

  const goPjgt = () => {
    if (isPjgt) return
    navigate(paths.pjgt)
  }

  const goToko = () => {
    if (isToko) return
    navigate(paths.toko)
  }

  const buttons = (
    <>
      <motion.button
        type="button"
        onClick={goSantri}
        className={`${modeBtnClass(isSantri)} ${btnClass}`}
        whileTap={{ scale: 0.92 }}
        aria-label={paths.labelSantri}
        aria-current={isSantri ? 'page' : undefined}
        title={paths.labelSantri}
      >
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222"
          />
        </svg>
        {showLabel ? <span className="text-[10px] font-medium leading-tight">Santri</span> : null}
      </motion.button>
      <motion.button
        type="button"
        onClick={goPjgt}
        className={`${modeBtnClass(isPjgt)} ${btnClass}`}
        whileTap={{ scale: 0.92 }}
        aria-label={paths.labelPjgt}
        aria-current={isPjgt ? 'page' : undefined}
        title={paths.labelPjgt}
      >
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
          />
        </svg>
        {showLabel ? <span className="text-[10px] font-medium leading-tight">PJGT</span> : null}
      </motion.button>
      <motion.button
        type="button"
        onClick={goToko}
        className={`${modeBtnClass(isToko)} ${btnClass}`}
        whileTap={{ scale: 0.92 }}
        aria-label={paths.labelToko}
        aria-current={isToko ? 'page' : undefined}
        title={paths.labelToko}
      >
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
          />
        </svg>
        {showLabel ? <span className="text-[10px] font-medium leading-tight">Toko</span> : null}
      </motion.button>
    </>
  )

  if (isHorizontal) {
    return <motion.div className="flex flex-row items-end gap-6 sm:gap-8">{buttons}</motion.div>
  }

  return buttons
}
