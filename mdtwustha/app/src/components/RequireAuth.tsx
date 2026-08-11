import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  clearSession,
  isLoggedIn,
  isSessionExpired,
  touchSessionActivity,
} from '../utils/auth'

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'pointerdown',
  'keydown',
  'scroll',
  'touchstart',
  'mousemove',
]

/**
 * Guard rute + idle sesi 5 jam: tanpa aktivitas → logout ke /login.
 */
export default function RequireAuth() {
  const location = useLocation()
  const navigate = useNavigate()
  const [allowed, setAllowed] = useState(() => isLoggedIn())

  useEffect(() => {
    if (!isLoggedIn()) {
      setAllowed(false)
      return
    }
    touchSessionActivity(true)
    setAllowed(true)
  }, [location.pathname])

  useEffect(() => {
    const onActivity = () => {
      if (isSessionExpired()) {
        clearSession()
        setAllowed(false)
        navigate('/login', { replace: true, state: { reason: 'idle' } })
        return
      }
      touchSessionActivity()
    }

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      onActivity()
      if (!isLoggedIn()) {
        setAllowed(false)
        navigate('/login', { replace: true, state: { reason: 'idle' } })
      }
    }

    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true })
    }
    document.addEventListener('visibilitychange', onVisibility)

    const timer = window.setInterval(() => {
      if (!isLoggedIn() || isSessionExpired()) {
        clearSession()
        setAllowed(false)
        navigate('/login', { replace: true, state: { reason: 'idle' } })
      }
    }, 60_000)

    return () => {
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, onActivity)
      }
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(timer)
    }
  }, [navigate])

  if (!allowed || !isLoggedIn()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
