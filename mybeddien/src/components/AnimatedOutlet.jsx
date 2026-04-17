import { useRef, useEffect } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'

const DURATION = 0.28

const slideVariants = {
  initial: (direction) => ({
    x: direction === 0 ? 0 : direction > 0 ? '100%' : '-100%',
  }),
  animate: {
    x: 0,
    transition: { duration: DURATION, ease: [0.25, 0.1, 0.25, 1] },
  },
  exit: (direction) => ({
    x: direction === 0 ? 0 : direction > 0 ? '-100%' : '100%',
    transition: { duration: DURATION, ease: [0.25, 0.1, 0.25, 1] },
  }),
}

export default function AnimatedOutlet() {
  const location = useLocation()
  const outlet = useOutlet()
  const pathname = location.pathname
  const prevPathRef = useRef(null)
  let direction = 0

  if (prevPathRef.current !== null && prevPathRef.current !== pathname) {
    const prevDepth = prevPathRef.current.split('/').filter(Boolean).length
    const currDepth = pathname.split('/').filter(Boolean).length
    direction = currDepth > prevDepth ? 1 : -1
  }

  useEffect(() => {
    prevPathRef.current = pathname
  }, [pathname])

  return (
    <AnimatePresence mode="wait" initial={false} custom={direction}>
      <motion.div
        key={pathname}
        custom={direction}
        variants={slideVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="min-h-full w-full"
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  )
}
