import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { fetchMe } from '../api/apiClient'
import { FullPageFade, pageEase } from '../components/PageTransition'
import { saveSession, homePathForRole } from '../utils/auth'

export default function AuthCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [message, setMessage] = useState('Menyimpan sesi…')
  const reduce = useReducedMotion()

  useEffect(() => {
    const token = params.get('token')
    const returnTo = params.get('returnTo') || homePathForRole('admin')

    if (!token) {
      navigate('/login?error=' + encodeURIComponent('Token sesi tidak ditemukan'), { replace: true })
      return
    }

    saveSession(token, {
      id: 0,
      email: '',
      name: null,
      picture: null,
      role: 'user',
    })

    void (async () => {
      const me = await fetchMe()
      if (me.success && me.user) {
        saveSession(token, me.user)
        const dest =
          me.user.role === 'pending'
            ? '/menunggu-akses'
            : returnTo.startsWith('/')
              ? returnTo === '/tagihan' || returnTo === '/dashboard'
                ? me.user.role === 'user'
                  ? homePathForRole(me.user.role)
                  : returnTo
                : returnTo
              : homePathForRole(me.user.role)
        // Sedikit jeda agar fade keluar terasa sebelum Layout masuk
        await new Promise((r) => setTimeout(r, reduce ? 40 : 180))
        navigate(dest, { replace: true })
      } else {
        setMessage(me.message || 'Gagal memverifikasi sesi')
        navigate('/login?error=' + encodeURIComponent(me.message || 'Gagal memverifikasi sesi'), {
          replace: true,
        })
      }
    })()
  }, [navigate, params, reduce])

  return (
    <FullPageFade className="min-h-screen grid place-items-center px-4 bg-canvas">
      <motion.div
        className="ui-card p-6 text-center text-ink min-w-[220px]"
        initial={reduce ? false : { opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: pageEase }}
      >
        <motion.div
          className="mx-auto mb-3 h-8 w-8 rounded-full border-2 border-[var(--accent)] border-t-transparent"
          animate={reduce ? undefined : { rotate: 360 }}
          transition={reduce ? undefined : { duration: 0.8, repeat: Infinity, ease: 'linear' }}
          aria-hidden
        />
        <p className="text-[14px] font-medium">{message}</p>
      </motion.div>
    </FullPageFade>
  )
}
