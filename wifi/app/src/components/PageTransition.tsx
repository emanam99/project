import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useRef, type ReactNode } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'

/** Easing lembut untuk seluruh app. */
export const pageEase = [0.22, 1, 0.36, 1] as const

type LocState = { navSwipe?: 1 | -1 }

/** Konten halaman di dalam Layout — animasi tiap ganti route. */
export function AnimatedOutlet() {
  const location = useLocation()
  const outlet = useOutlet()
  const reduce = useReducedMotion()
  const swipeDir = useRef<1 | -1 | 0>(0)
  const incoming = (location.state as LocState | null)?.navSwipe
  if (incoming === 1 || incoming === -1) {
    swipeDir.current = incoming
  }

  const dir = swipeDir.current

  return (
    <AnimatePresence
      mode="wait"
      initial={false}
      onExitComplete={() => {
        swipeDir.current = 0
      }}
    >
      <motion.div
        key={location.pathname}
        className="min-w-0 w-full"
        initial={
          reduce
            ? { opacity: 0 }
            : dir === 1
              ? { opacity: 0, x: 28 }
              : dir === -1
                ? { opacity: 0, x: -28 }
                : { opacity: 0, y: 10 }
        }
        animate={reduce ? { opacity: 1 } : { opacity: 1, x: 0, y: 0 }}
        exit={() => {
          if (reduce) return { opacity: 0 }
          const d = swipeDir.current
          if (d === 1) return { opacity: 0, x: -20 }
          if (d === -1) return { opacity: 0, x: 20 }
          return { opacity: 0, y: -6 }
        }}
        transition={{
          duration: reduce ? 0.12 : 0.24,
          ease: pageEase,
        }}
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  )
}

/**
 * Wrapper halaman auth. Transisi shell ditangani di App.tsx —
 * di sini hanya container biasa agar tidak double-fade.
 */
export function FullPageFade({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={className}>{children}</div>
}
