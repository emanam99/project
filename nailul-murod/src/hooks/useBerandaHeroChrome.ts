import {
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion'
import { useEffect, useMemo, useState, type RefObject } from 'react'

/** Scroll (px) dari atas → chrome sepenuhnya terlihat */
const REVEAL_SCROLL_PX = 40
/** Ruang untuk topbar fixed + sedikit napas */
const TOPBAR_OFFSET_PX = 56
/** Setara area tap nav + sedikit; maks mendekati padding konten mobile beranda */
const MAIN_PAD_BOTTOM_MIN = 20
const MAIN_PAD_BOTTOM_MAX = 94

type Result = {
  enabled: boolean
  /** Untuk pembungkus header mobile (slide ke atas saat hero penuh) */
  topY: MotionValue<string>
  topOpacity: MotionValue<number>
  topPointerEvents: MotionValue<'none' | 'auto'>
  /** Untuk host nav bawah (slide ke bawah) */
  bottomY: MotionValue<string>
  bottomOpacity: MotionValue<number>
  bottomPointerEvents: MotionValue<'none' | 'auto'>
  paddingTop: MotionValue<string>
  paddingBottom: MotionValue<string>
}

/**
 * Beranda + viewport mobile: sembunyikan header & nav bawah saat scroll ≈0 (mode logo penuh),
 * muncul halus setelah scroll sedikit.
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
  const bottomY = useTransform(reveal, [0, 1], ['100%', '0%'])
  const bottomOpacity = useTransform(reveal, [0, 0.14, 1], [0, 1, 1])
  const bottomPointerEvents = useTransform(reveal, (v) => (v < 0.06 ? 'none' : 'auto'))

  const padTopPx = useTransform(reveal, [0, 1], [0, TOPBAR_OFFSET_PX])
  const padBottomInner = useTransform(reveal, [0, 1], [MAIN_PAD_BOTTOM_MIN, MAIN_PAD_BOTTOM_MAX])

  const paddingTop = useMotionTemplate`calc(${padTopPx}px + env(safe-area-inset-top, 0px))`
  const paddingBottom = useMotionTemplate`calc(${padBottomInner}px + env(safe-area-inset-bottom, 0px))`

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
