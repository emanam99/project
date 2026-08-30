import {
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion'
import { useEffect, useMemo, useState, type RefObject } from 'react'

/** Scroll (px) dari atas → header topbar sepenuhnya terlihat */
const REVEAL_SCROLL_PX = 40
/** Ruang untuk topbar fixed + sedikit napas */
const TOPBAR_OFFSET_PX = 56
/** Nav bawah selalu terlihat — padding bawah konstan */
const MAIN_PAD_BOTTOM = 94

type Result = {
  enabled: boolean
  /** Header atas: slide saat hero penuh (logo-only) */
  topY: MotionValue<string>
  topOpacity: MotionValue<number>
  topPointerEvents: MotionValue<'none' | 'auto'>
  /** Nav bawah: selalu terlihat agar menu dapat diakses sejak awal */
  bottomY: MotionValue<string>
  bottomOpacity: MotionValue<number>
  bottomPointerEvents: MotionValue<'none' | 'auto'>
  paddingTop: MotionValue<string>
  paddingBottom: MotionValue<string>
}

/**
 * Beranda + viewport mobile: hero logo penuh di atas, tapi nav bawah (Beranda / List Bab)
 * tetap terlihat sejak awal — tidak disembunyikan saat scrollTop ≈ 0.
 */
export function useBerandaHeroChrome(
  mainRef: RefObject<HTMLElement | null>,
  isBerandaPage: boolean,
  dataLoading: boolean,
): Result {
  const [narrowMobile, setNarrowMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 960px)').matches,
  )
  const [landscapePhone, setLandscapePhone] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 960px) and (orientation: landscape)').matches,
  )
  const [reduceMotion, setReduceMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 960px)')
    const fn = () => setNarrowMobile(mq.matches)
    fn()
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 960px) and (orientation: landscape)')
    const fn = () => setLandscapePhone(mq.matches)
    fn()
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const fn = () => setReduceMotion(mq.matches)
    fn()
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  const enabled = isBerandaPage && !dataLoading && narrowMobile && !landscapePhone

  const target = useMotionValue(1)

  const springConfig = useMemo(
    () =>
      reduceMotion
        ? { stiffness: 720, damping: 46, mass: 0.32 }
        : { stiffness: 360, damping: 36, mass: 0.42 },
    [reduceMotion],
  )

  const reveal = useSpring(target, springConfig)

  useEffect(() => {
    if (!enabled) {
      target.set(1)
      return
    }

    const el = mainRef.current
    if (!el) {
      target.set(1)
      return
    }

    const tick = () => {
      const t = Math.min(1, Math.max(0, el.scrollTop / REVEAL_SCROLL_PX))
      target.set(t)
    }

    tick()
    el.addEventListener('scroll', tick, { passive: true })
    return () => el.removeEventListener('scroll', tick)
  }, [enabled, mainRef, target])

  const topY = useTransform(reveal, [0, 1], ['-100%', '0%'])
  const topOpacity = useTransform(reveal, [0, 0.14, 1], [0, 1, 1])
  const topPointerEvents = useTransform(reveal, (v) => (v < 0.06 ? 'none' : 'auto'))

  const bottomY = useMotionValue('0%')
  const bottomOpacity = useMotionValue(1)
  const bottomPointerEvents = useMotionValue<'none' | 'auto'>('auto')

  const padTopPx = useTransform(reveal, [0, 1], [0, TOPBAR_OFFSET_PX])
  const padBottomPx = useMotionValue(MAIN_PAD_BOTTOM)

  const paddingTop = useMotionTemplate`calc(${padTopPx}px + env(safe-area-inset-top, 0px))`
  const paddingBottom = useMotionTemplate`calc(${padBottomPx}px + env(safe-area-inset-bottom, 0px))`

  return useMemo(
    () => ({
      enabled,
      topY,
      topOpacity,
      topPointerEvents,
      bottomY,
      bottomOpacity,
      bottomPointerEvents,
      paddingTop,
      paddingBottom,
    }),
    [
      enabled,
      topY,
      topOpacity,
      topPointerEvents,
      bottomY,
      bottomOpacity,
      bottomPointerEvents,
      paddingTop,
      paddingBottom,
    ],
  )
}
