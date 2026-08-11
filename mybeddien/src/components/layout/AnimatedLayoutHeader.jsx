import { useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import AppHeader from './AppHeader'
import { BOTTOM_NAV_MENU_PATH } from '../../navigation/bottomNavConfig'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'

const headerSpring = { type: 'spring', stiffness: 340, damping: 36, mass: 0.88 }

const headerVariants = {
  hidden: { opacity: 0, y: -22, height: 0 },
  visible: {
    opacity: 1,
    y: 0,
    height: 'auto',
    transition: headerSpring,
  },
  exit: {
    opacity: 0,
    y: -18,
    height: 0,
    transition: { ...headerSpring, stiffness: 400, damping: 38 },
  },
}

/** Header disembunyikan di halaman Menu; animasi halus saat masuk/keluar. */
export default function AnimatedLayoutHeader() {
  const { pathname } = useLocation()
  const isMenuPage = pathname === BOTTOM_NAV_MENU_PATH
  const reducedMotion = usePrefersReducedMotion()

  if (reducedMotion) {
    if (isMenuPage) return null
    return (
      <div className="relative z-50 shrink-0">
        <AppHeader />
      </div>
    )
  }

  return (
    <AnimatePresence initial={false} mode="wait">
      {!isMenuPage && (
        <motion.div
          key="app-header"
          className="relative z-50 shrink-0 overflow-visible"
          variants={headerVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <AppHeader />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
