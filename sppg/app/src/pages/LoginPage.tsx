import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { getGoogleLoginUrl, getPlatformGoogleLoginUrl } from '../api/apiClient'
import { FullPageFade, pageEase } from '../components/PageTransition'
import PwaInstallButton from '../components/PwaInstallButton'
import { APP_NAME } from '../config/version'
import { getStoredUser, isLoggedIn, isPlatformAdminRole } from '../utils/auth'
import { gambarUrl } from '../utils/gambar'
import { getLandingUrl, isLandingHost, isPlatformAdminHost } from '../utils/tenantHost'

export default function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [checking, setChecking] = useState(true)
  const reduce = useReducedMotion()
  const error = params.get('error') || ''

  const isAdminHost = isPlatformAdminHost()

  useEffect(() => {
    if (isLoggedIn()) {
      if (isAdminHost) {
        const user = getStoredUser()
        if (isPlatformAdminRole(user?.role)) {
          navigate('/', { replace: true })
          return
        }
      } else {
        navigate('/dashboard', { replace: true })
        return
      }
    }
    setChecking(false)
  }, [navigate, isAdminHost])

  // Kunci scroll sepenuhnya selama di halaman login
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const prevHtmlOverflow = html.style.overflow
    const prevBodyOverflow = body.style.overflow
    const prevHtmlHeight = html.style.height
    const prevBodyHeight = body.style.height
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    html.style.height = '100%'
    body.style.height = '100%'
    return () => {
      html.style.overflow = prevHtmlOverflow
      body.style.overflow = prevBodyOverflow
      html.style.height = prevHtmlHeight
      body.style.height = prevBodyHeight
    }
  }, [])

  if (checking) return null

  return (
    <FullPageFade className="h-dvh max-h-dvh w-full overflow-hidden relative flex flex-col items-center justify-start pt-[12vh] sm:pt-[14vh] px-5 bg-canvas select-none">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <motion.div
          className="absolute -top-28 right-[-20%] h-[55vh] w-[55vh] max-w-[420px] rounded-full blur-3xl"
          style={{ background: 'var(--accent)' }}
          initial={reduce ? false : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: 0.2, scale: 1 }}
          transition={{ duration: 1.15, ease: pageEase }}
        />
        <motion.div
          className="absolute -bottom-32 left-[-15%] h-[45vh] w-[45vh] max-w-[360px] rounded-full blur-3xl"
          style={{ background: 'color-mix(in srgb, var(--accent) 50%, transparent)' }}
          initial={reduce ? false : { opacity: 0, scale: 0.92 }}
          animate={{ opacity: 0.28, scale: 1 }}
          transition={{ duration: 1.25, ease: pageEase, delay: 0.06 }}
        />
      </div>

      <motion.div
        className="relative z-10 w-full max-w-[340px] flex flex-col items-center text-center"
        initial={reduce ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, ease: pageEase }}
      >
        <motion.img
          src={gambarUrl('icon/sppg.v3.u.png')}
          alt={APP_NAME}
          width={128}
          height={128}
          className="h-[6.5rem] w-[6.5rem] sm:h-28 sm:w-28 object-contain drop-shadow-lg"
          draggable={false}
          initial={reduce ? false : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: pageEase, delay: reduce ? 0 : 0.04 }}
        />

        <h1 className="mt-5 font-display text-[1.85rem] font-bold tracking-tight text-ink leading-none">
          {isAdminHost ? 'Admin Platform' : APP_NAME}
        </h1>
        <p className="mt-1.5 text-[13px] font-medium tracking-[0.04em] text-muted">
          {isAdminHost ? 'SPPG Cloudy' : 'al-utsmani'}
        </p>

        <p className="mt-4 text-[0.92rem] text-muted leading-snug max-w-[280px]">
          {isAdminHost
            ? 'Kelola tenant, langganan, dan pembayaran platform.'
            : 'Catat belanja dapur santri — masuk dengan Google.'}
        </p>

        {error && (
          <div className="ui-alert-error mt-4 w-full text-left text-[13px]">{error}</div>
        )}

        <a
          href={isAdminHost ? getPlatformGoogleLoginUrl('/') : getGoogleLoginUrl('/dashboard')}
          className="mt-6 ui-btn-primary w-full py-3 text-[0.95rem] gap-2.5 rounded-xl shadow-md shadow-[color-mix(in_srgb,var(--accent)_22%,transparent)]"
        >
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" aria-hidden>
            <path
              fill="#fff"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              opacity=".9"
            />
            <path
              fill="#fff"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              opacity=".75"
            />
            <path
              fill="#fff"
              d="M5.84 14.09A6.97 6.97 0 0 1 5.5 12c0-.72.13-1.41.34-2.09V7.07H2.18A11.96 11.96 0 0 0 1 12c0 1.94.46 3.77 1.28 5.4l3.56-2.77.01-.54z"
              opacity=".6"
            />
            <path
              fill="#fff"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Masuk dengan Google
        </a>

        <div className="mt-3 w-full">
          <PwaInstallButton className="w-full justify-center h-10 rounded-xl border-transparent bg-transparent hover:bg-surface-soft/80 text-muted" />
        </div>

        <p className="mt-5 text-[11px] text-faint leading-snug max-w-[260px]">
          {isAdminHost ? (
            <>Hanya email terdaftar di platform_admins yang boleh masuk.</>
          ) : (
            <>Akses fitur diberikan admin setelah login pertama.</>
          )}
          {!isAdminHost && isLandingHost() ? (
            <>
              {' '}
              <a href="/daftar" className="text-[var(--accent)] font-medium">Daftar SPPG baru</a>
            </>
          ) : !isAdminHost && getLandingUrl() ? (
            <>
              {' '}
              <a href={`${getLandingUrl()}/daftar`} className="text-[var(--accent)] font-medium">Daftar SPPG baru</a>
            </>
          ) : null}
        </p>
      </motion.div>
    </FullPageFade>
  )
}
