import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { getGoogleLoginUrl } from '../api/apiClient'
import { FullPageFade, pageEase } from '../components/PageTransition'
import OfflineBanner from '../components/OfflineBanner'
import PwaInstallButton from '../components/PwaInstallButton'
import { APP_NAME } from '../config/version'
import { useTheme } from '../contexts/ThemeContext'
import { isLoggedIn, homePathForRole, getStoredUser } from '../utils/auth'
import { gambarUrl } from '../utils/gambar'

function ThemeToggleButton() {
  const { isDark, toggleTheme } = useTheme()
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="absolute top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] z-20 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-line/80 bg-surface/70 text-ink shadow-sm backdrop-blur-xl transition hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--line))] hover:bg-surface"
      aria-label={isDark ? 'Mode terang' : 'Mode gelap'}
      title={isDark ? 'Mode terang' : 'Mode gelap'}
    >
      <motion.span
        key={isDark ? 'sun' : 'moon'}
        initial={{ opacity: 0, rotate: -30, scale: 0.8 }}
        animate={{ opacity: 1, rotate: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: pageEase }}
        className="inline-flex"
      >
        {isDark ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <circle cx="12" cy="12" r="4" />
            <path strokeLinecap="round" d="M12 2v2.2M12 19.8V22M4.2 12H2M22 12h-2.2M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5Z"
            />
          </svg>
        )}
      </motion.span>
    </button>
  )
}

function LoginAmbientBg({ reduce }: { reduce: boolean | null }) {
  if (reduce) {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute -top-24 right-[-18%] h-[52vh] w-[52vh] max-w-[440px] rounded-full blur-3xl opacity-25"
          style={{ background: 'var(--accent)' }}
        />
        <div
          className="absolute -bottom-28 left-[-12%] h-[42vh] w-[42vh] max-w-[360px] rounded-full blur-3xl opacity-30"
          style={{ background: 'color-mix(in srgb, var(--accent) 55%, transparent)' }}
        />
      </div>
    )
  }

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* Soft mesh wash */}
      <motion.div
        className="absolute inset-0 opacity-90"
        style={{
          background:
            'radial-gradient(ellipse 80% 55% at 15% 10%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 60%), radial-gradient(ellipse 70% 50% at 90% 85%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 55%)',
        }}
        animate={{ opacity: [0.75, 1, 0.75] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Drifting orbs */}
      <motion.div
        className="absolute -top-28 right-[-18%] h-[58vh] w-[58vh] max-w-[480px] rounded-full blur-3xl"
        style={{ background: 'var(--accent)' }}
        initial={{ opacity: 0.18, scale: 0.92 }}
        animate={{
          opacity: [0.16, 0.28, 0.16],
          scale: [1, 1.08, 1],
          x: [0, -28, 0],
          y: [0, 22, 0],
        }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-36 left-[-16%] h-[50vh] w-[50vh] max-w-[400px] rounded-full blur-3xl"
        style={{ background: 'color-mix(in srgb, var(--accent) 70%, #67e8f9)' }}
        animate={{
          opacity: [0.22, 0.34, 0.22],
          scale: [1, 1.12, 1],
          x: [0, 36, 0],
          y: [0, -18, 0],
        }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
      />
      <motion.div
        className="absolute top-[38%] left-[42%] h-[28vh] w-[28vh] max-w-[240px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{ background: 'color-mix(in srgb, var(--accent) 40%, transparent)' }}
        animate={{
          opacity: [0.1, 0.22, 0.1],
          scale: [0.9, 1.15, 0.9],
        }}
        transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }}
      />

      {/* Subtle floating dots */}
      {[
        { top: '18%', left: '12%', size: 6, delay: 0 },
        { top: '28%', left: '78%', size: 4, delay: 1.4 },
        { top: '62%', left: '18%', size: 5, delay: 0.7 },
        { top: '72%', left: '70%', size: 3, delay: 2.1 },
        { top: '44%', left: '88%', size: 4, delay: 0.3 },
      ].map((d, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{
            top: d.top,
            left: d.left,
            width: d.size,
            height: d.size,
            background: 'color-mix(in srgb, var(--accent) 70%, white)',
            boxShadow: '0 0 12px color-mix(in srgb, var(--accent) 45%, transparent)',
          }}
          animate={{ y: [0, -14, 0], opacity: [0.25, 0.7, 0.25] }}
          transition={{ duration: 5.5 + i, repeat: Infinity, ease: 'easeInOut', delay: d.delay }}
        />
      ))}

      {/* Slow rotating ring */}
      <motion.div
        className="absolute left-1/2 top-[22%] h-[min(72vw,320px)] w-[min(72vw,320px)] -translate-x-1/2 rounded-full border border-[color-mix(in_srgb,var(--accent)_18%,transparent)]"
        animate={{ rotate: 360 }}
        transition={{ duration: 48, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="absolute left-1/2 top-[22%] h-[min(56vw,250px)] w-[min(56vw,250px)] -translate-x-1/2 rounded-full border border-dashed border-[color-mix(in_srgb,var(--accent)_14%,transparent)]"
        animate={{ rotate: -360 }}
        transition={{ duration: 64, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  )
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [checking, setChecking] = useState(true)
  const reduce = useReducedMotion()
  const error = params.get('error') || ''

  useEffect(() => {
    if (isLoggedIn()) {
      navigate(homePathForRole(getStoredUser()?.role), { replace: true })
      return
    }
    setChecking(false)
  }, [navigate])

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
    <FullPageFade className="h-dvh max-h-dvh w-full overflow-hidden relative flex flex-col items-center justify-center px-5 bg-canvas select-none">
      <OfflineBanner absolute />
      <LoginAmbientBg reduce={reduce} />
      <ThemeToggleButton />

      <motion.div
        className="relative z-10 w-full max-w-[360px] flex flex-col items-center text-center"
        initial={reduce ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: pageEase }}
      >
        <motion.div
          className="relative"
          initial={reduce ? false : { opacity: 0, scale: 0.88 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.55, ease: pageEase, delay: reduce ? 0 : 0.04 }}
        >
          <motion.div
            className="absolute inset-[-18%] rounded-[2rem] blur-2xl"
            style={{ background: 'color-mix(in srgb, var(--accent) 35%, transparent)' }}
            animate={
              reduce
                ? undefined
                : { opacity: [0.35, 0.65, 0.35], scale: [0.95, 1.05, 0.95] }
            }
            transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden
          />
          <img
            src={gambarUrl('icon/connect.png')}
            alt={APP_NAME}
            width={128}
            height={128}
            className="relative h-[6.25rem] w-[6.25rem] sm:h-[7rem] sm:w-[7rem] object-contain drop-shadow-xl"
            draggable={false}
          />
        </motion.div>

        <motion.h1
          className="mt-6 font-display text-[2.15rem] sm:text-[2.35rem] font-bold tracking-tight text-ink leading-none"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: pageEase, delay: reduce ? 0 : 0.1 }}
        >
          {APP_NAME}
        </motion.h1>

        <motion.p
          className="mt-3 text-[0.95rem] text-muted leading-snug max-w-[280px]"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: pageEase, delay: reduce ? 0 : 0.16 }}
        >
          Catat tagihan WiFi pelanggan dengan rapi.
        </motion.p>

        {error && (
          <motion.div
            className="ui-alert-error mt-5 w-full text-left text-[13px]"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {error}
          </motion.div>
        )}

        <motion.a
          href={getGoogleLoginUrl('/dashboard')}
          className="mt-8 group relative w-full overflow-hidden rounded-2xl border border-line bg-surface/85 py-3.5 px-4 text-[0.98rem] font-semibold text-ink shadow-[0_12px_40px_-18px_color-mix(in_srgb,var(--accent)_55%,transparent)] backdrop-blur-xl transition hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))] hover:bg-surface"
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: pageEase, delay: reduce ? 0 : 0.22 }}
          whileHover={reduce ? undefined : { y: -1 }}
          whileTap={reduce ? undefined : { scale: 0.985 }}
        >
          <span
            className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100"
            style={{
              background:
                'linear-gradient(120deg, transparent 20%, color-mix(in srgb, var(--accent) 12%, transparent) 50%, transparent 80%)',
            }}
            aria-hidden
          />
          <span className="relative z-[1] inline-flex w-full items-center justify-center gap-3">
            <svg viewBox="0 0 24 24" className="h-[20px] w-[20px] shrink-0" aria-hidden>
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Masuk dengan Google
          </span>
        </motion.a>

        <motion.div
          className="mt-4 w-full"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: reduce ? 0 : 0.3 }}
        >
          <PwaInstallButton variant="login" />
        </motion.div>

        <motion.p
          className="mt-5 text-[11px] text-faint leading-snug max-w-[260px]"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: reduce ? 0 : 0.36 }}
        >
          Akses fitur diberikan admin setelah login pertama.
        </motion.p>
      </motion.div>
    </FullPageFade>
  )
}
