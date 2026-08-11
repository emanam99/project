import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useSantriDataStore } from '../store/santriDataStore'
import { isSantriGuruTugas } from '../utils/santriGuruTugas'
import { ACCESS_MODE } from '../config/accessMode'
import { getAdjacentBottomNavPath, getBottomNavTabIndex } from '../navigation/bottomNavConfig'

function inferAccessModeFromPathname(pathname) {
  if (pathname.startsWith('/pjgt/')) return ACCESS_MODE.pjgt
  if (pathname.startsWith('/santri/')) return ACCESS_MODE.santri
  if (pathname.startsWith('/toko/')) return ACCESS_MODE.toko
  if (pathname.startsWith('/wali-santri')) return ACCESS_MODE.wali
  return null
}

const SWIPE_MIN_PX = 56
/** Geser horizontal harus dominan dibanding vertikal */
const VERTICAL_RATIO_MAX = 0.55

/** Hanya elemen yang benar-benar butuh interaksi tap — link boleh di-swipe */
function isSwipeBlockedTarget(el) {
  if (!el || !(el instanceof Element)) return false
  return Boolean(
    el.closest(
      'input, textarea, select, button, [data-no-tab-swipe], [contenteditable="true"]'
    )
  )
}

function useIsMobileViewport() {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 639px)').matches : false
  )
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const mq = window.matchMedia('(max-width: 639px)')
    const sync = () => setMobile(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return mobile
}

/**
 * Swipe kiri/kanan (mobile) untuk berpindah tab bottom nav — selaras urutan menu.
 * @param {React.RefObject<HTMLElement | null>} scrollRef — elemen scroll konten halaman
 */
export function useBottomNavSwipeNavigate(scrollRef) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user, activeAccess } = useAuthStore()
  const biodata = useSantriDataStore((s) => s.biodata)
  const isMobile = useIsMobileViewport()
  const access = activeAccess || inferAccessModeFromPathname(pathname)
  const isGuruTugas = access === ACCESS_MODE.santri && isSantriGuruTugas(biodata)
  const opts = useMemo(() => ({ isGuruTugas }), [isGuruTugas])
  const touchRef = useRef(null)
  const lockRef = useRef(false)
  const suppressClickRef = useRef(false)

  const tabIndex = useMemo(
    () => (isMobile ? getBottomNavTabIndex(pathname, user, access, opts) : -1),
    [isMobile, pathname, user, access, opts]
  )

  useEffect(() => {
    const el = scrollRef?.current
    if (!el || !isMobile) return undefined

    const onClickCapture = (e) => {
      if (!suppressClickRef.current) return
      e.preventDefault()
      e.stopPropagation()
    }

    el.addEventListener('click', onClickCapture, true)
    return () => el.removeEventListener('click', onClickCapture, true)
  }, [scrollRef, isMobile, pathname])

  const onTouchStart = useCallback(
    (e) => {
      if (!isMobile || tabIndex < 0 || lockRef.current) return
      if (e.touches.length !== 1) return
      if (isSwipeBlockedTarget(e.target)) return
      const t = e.touches[0]
      touchRef.current = {
        x0: t.clientX,
        y0: t.clientY,
        scrollTop0: scrollRef?.current?.scrollTop ?? 0,
      }
    },
    [isMobile, tabIndex, scrollRef]
  )

  const onTouchEnd = useCallback(
    (e) => {
      if (!isMobile || tabIndex < 0 || !touchRef.current || lockRef.current) return
      const t = e.changedTouches[0]
      const { x0, y0, scrollTop0 } = touchRef.current
      touchRef.current = null

      const dx = t.clientX - x0
      const dy = t.clientY - y0
      const adx = Math.abs(dx)
      const ady = Math.abs(dy)

      if (adx < SWIPE_MIN_PX) return
      if (ady > adx * VERTICAL_RATIO_MAX) return
      if (scrollTop0 > 8 && ady > 12) return

      /** Geser kiri → tab di kanan; geser kanan → tab di kiri */
      const delta = dx > 0 ? -1 : 1
      const nextPath = getAdjacentBottomNavPath(pathname, delta, user, access, opts)
      if (!nextPath) return

      suppressClickRef.current = true
      lockRef.current = true
      navigate(nextPath)
      window.setTimeout(() => {
        lockRef.current = false
        suppressClickRef.current = false
      }, 400)
    },
    [isMobile, tabIndex, pathname, navigate, user, access, opts]
  )

  const onTouchCancel = useCallback(() => {
    touchRef.current = null
  }, [])

  return {
    onTouchStart,
    onTouchEnd,
    onTouchCancel,
    canSwipe: isMobile && tabIndex >= 0,
  }
}
