import { useEffect, useMemo, useRef } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import { getPageTransitionDirection } from '../navigation/pageTransitionDirection'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { useBottomNavSwipeNavigate } from '../hooks/useBottomNavSwipeNavigate'
import { useSantriBiodata } from '../hooks/useSantriCachedResources'
import { isSantriGuruTugas } from '../utils/santriGuruTugas'
import { ACCESS_MODE } from '../config/accessMode'

const DURATION = 0.28
const EASE = [0.25, 0.1, 0.25, 1]

/** direction 1 = indeks naik (geser kiri): masuk dari kanan; -1 = indeks turun: masuk dari kiri */
const slideVariants = {
  initial: (direction) => ({
    x: direction === 0 ? 0 : direction > 0 ? '100%' : '-100%',
    opacity: direction === 0 ? 1 : 0.96,
  }),
  animate: {
    x: 0,
    opacity: 1,
    transition: { duration: DURATION, ease: EASE },
  },
  exit: (direction) => ({
    x: direction === 0 ? 0 : direction > 0 ? '-100%' : '100%',
    opacity: direction === 0 ? 1 : 0.96,
    transition: { duration: DURATION, ease: EASE },
  }),
}

const fadeVariants = {
  initial: { opacity: 0.98 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0.98, transition: { duration: 0.18 } },
}

export default function AnimatedOutlet() {
  const location = useLocation()
  const outlet = useOutlet()
  const pathname = location.pathname
  const user = useAuthStore((s) => s.user)
  const activeAccess = useAuthStore((s) => s.activeAccess)
  const { biodata } = useSantriBiodata()
  const reducedMotion = usePrefersReducedMotion()
  const navOpts = useMemo(() => {
    const isGuruTugas = activeAccess === ACCESS_MODE.santri && isSantriGuruTugas(biodata)
    return { isGuruTugas }
  }, [activeAccess, biodata])

  const prevPathRef = useRef(null)
  const directionRef = useRef(0)
  const scrollRef = useRef(null)
  const { onTouchStart, onTouchEnd, onTouchCancel, canSwipe } = useBottomNavSwipeNavigate(scrollRef)

  if (prevPathRef.current !== null && prevPathRef.current !== pathname) {
    directionRef.current = getPageTransitionDirection(
      prevPathRef.current,
      pathname,
      user,
      activeAccess,
      navOpts
    )
  }

  useEffect(() => {
    prevPathRef.current = pathname
  }, [pathname])

  const direction = reducedMotion ? 0 : directionRef.current
  const variants = reducedMotion ? fadeVariants : slideVariants
  /** pathname saja — perubahan ?edit= / ?baru= tidak memicu slide ulang seluruh halaman */
  const navKey = pathname

  return (
    <motion.div
      className="relative z-0 h-full min-h-0 w-full overflow-hidden"
      onTouchStart={canSwipe ? onTouchStart : undefined}
      onTouchEnd={canSwipe ? onTouchEnd : undefined}
      onTouchCancel={canSwipe ? onTouchCancel : undefined}
      style={canSwipe ? { touchAction: 'pan-y' } : undefined}
    >
      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div
          key={navKey}
          ref={scrollRef}
          custom={direction}
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="h-full min-h-0 w-full overflow-y-auto overflow-x-hidden overscroll-contain will-change-transform"
        >
          {outlet}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}
