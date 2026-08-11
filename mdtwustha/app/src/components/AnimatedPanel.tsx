import { AnimatePresence, motion, type HTMLMotionProps } from 'framer-motion'
import type { ReactNode } from 'react'

const ease = [0.32, 0.72, 0, 1] as const

export const tabPanelMotion = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.22, ease },
}

export const routeMotion = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.25, ease },
}

type AnimatedPanelProps = {
  panelKey: string
  children: ReactNode
  className?: string
  mode?: 'wait' | 'sync' | 'popLayout'
} & Omit<HTMLMotionProps<'div'>, 'children'>

/**
 * Transisi antar tab / panel dengan fade + geser ringan.
 */
export function AnimatedPanel({
  panelKey,
  children,
  className,
  mode = 'wait',
  ...motionProps
}: AnimatedPanelProps) {
  return (
    <AnimatePresence mode={mode}>
      <motion.div
        key={panelKey}
        className={className}
        initial={tabPanelMotion.initial}
        animate={tabPanelMotion.animate}
        exit={tabPanelMotion.exit}
        transition={tabPanelMotion.transition}
        {...motionProps}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

type RouteFadeProps = {
  routeKey: string
  children: ReactNode
  className?: string
}

/** Transisi antar halaman (pakai useOutlet + pathname). */
export function RouteFade({ routeKey, children, className }: RouteFadeProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={routeKey}
        className={className ?? 'h-full min-h-0'}
        initial={routeMotion.initial}
        animate={routeMotion.animate}
        exit={routeMotion.exit}
        transition={routeMotion.transition}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
