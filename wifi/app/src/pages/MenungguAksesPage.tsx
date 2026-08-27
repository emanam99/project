import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { fetchMe } from '../api/apiClient'
import { FullPageFade, pageEase } from '../components/PageTransition'
import ProfileMenu from '../components/ProfileMenu'
import {
  getStoredUser,
  hasAppAccess,
  homePathForRole,
  type AuthUser,
} from '../utils/auth'
import { gambarUrl } from '../utils/gambar'

const POLL_MS = 3000

export default function MenungguAksesPage() {
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser())
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const redirectIfGranted = (next: AuthUser) => {
      if (!hasAppAccess(next.role)) return false
      navigate(homePathForRole(next.role), { replace: true })
      return true
    }

    const poll = async () => {
      if (cancelled || document.hidden) return
      setChecking(true)
      try {
        const res = await fetchMe()
        if (cancelled) return
        if (res.success && res.user) {
          setUser(res.user)
          if (redirectIfGranted(res.user)) return
        }
      } finally {
        if (!cancelled) setChecking(false)
      }
      if (!cancelled) {
        timer = setTimeout(() => void poll(), POLL_MS)
      }
    }

    void poll()

    const onVisible = () => {
      if (document.hidden) return
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      void poll()
    }

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [navigate])

  return (
    <FullPageFade className="min-h-screen flex flex-col bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur-xl">
        <div className="px-3.5 py-2.5 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src={gambarUrl('icon/connect.png')}
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 rounded-lg object-contain shrink-0"
              draggable={false}
            />
            <div className="font-display text-[15px] font-bold text-ink leading-tight">Wifi</div>
          </div>
          <ProfileMenu user={user} />
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-3 py-6">
        <motion.div
          className="ui-card w-full max-w-sm p-5 text-center"
          initial={reduce ? false : { opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: pageEase, delay: reduce ? 0 : 0.06 }}
        >
          <div className="mx-auto h-10 w-10 rounded-xl bg-amber-500 text-white grid place-items-center font-display text-sm font-bold mb-3">
            !
          </div>
          <h1 className="ui-page-title">Menunggu akses</h1>
          <p className="ui-page-sub mt-2 leading-relaxed">
            Akun Anda belum memiliki akses. Silakan hubungi admin untuk meminta akses.
          </p>
          {user?.email && (
            <p className="mt-3 rounded-lg border border-line bg-surface-soft px-2.5 py-1.5 text-[13px] text-ink break-all">
              {user.email}
            </p>
          )}
          <p className="mt-4 text-[11px] text-faint">
            {checking
              ? 'Memeriksa status akses…'
              : 'Halaman ini memperbarui otomatis. Setelah akses diberikan, Anda akan diarahkan ke tagihan.'}
          </p>
        </motion.div>
      </div>
    </FullPageFade>
  )
}
