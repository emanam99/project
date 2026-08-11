import { AnimatePresence, motion } from 'framer-motion'
import { NavLink } from 'react-router-dom'
import { SyiirLayoutToggleIcon } from '../reader/SyiirLayoutToggleIcon'
import type { SyiirLayoutMode } from '../../contexts/SyiirReaderContext'

type Props = {
  showReaderFontSettings?: boolean
  onReaderFontSettings?: () => void
  showSyiirLayoutToggle?: boolean
  syiirLayoutMode?: SyiirLayoutMode
  onToggleSyiirLayout?: () => void
  /** Nav di dalam host fixed (beranda) — hilangkan position fixed ganda */
  dockedInBerandaChrome?: boolean
}

const activePillTransition = { type: 'spring' as const, stiffness: 420, damping: 34 }
const layoutSpring = { type: 'spring' as const, stiffness: 380, damping: 32 }
const readerNavItemTransition = { type: 'spring' as const, stiffness: 400, damping: 30 }

export function MobileBottomNav({
  showReaderFontSettings,
  onReaderFontSettings,
  showSyiirLayoutToggle,
  syiirLayoutMode = 'paired',
  onToggleSyiirLayout,
  dockedInBerandaChrome,
}: Props) {
  const extraReaderChrome = Boolean(showReaderFontSettings || showSyiirLayoutToggle)

  return (
    <nav
      className={`mobile-bottom-nav${extraReaderChrome ? ' mobile-bottom-nav--with-settings' : ''}${dockedInBerandaChrome ? ' mobile-bottom-nav--beranda-docked' : ''}`}
      aria-label="Navigasi utama"
    >
      <motion.div
        className="mobile-bottom-nav__surface"
        layout
        transition={{ layout: layoutSpring }}
      >
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `mobile-bottom-nav__link${isActive ? ' mobile-bottom-nav__link--active' : ''}`
          }
        >
          {({ isActive }) => (
            <span className="mobile-bottom-nav__link-body">
              <span className="mobile-bottom-nav__icon-wrap">
                {isActive && (
                  <motion.span
                    className="mobile-bottom-nav__active-disc"
                    layoutId="mobile-bottom-nav-active-pill"
                    transition={activePillTransition}
                  />
                )}
                <motion.span
                  className="mobile-bottom-nav__emoji"
                  aria-hidden
                  animate={{ scale: isActive ? 1.06 : 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                >
                  🏠
                </motion.span>
              </span>
              <small>Beranda</small>
            </span>
          )}
        </NavLink>
        <NavLink
          to="/list"
          className={({ isActive }) =>
            `mobile-bottom-nav__link${isActive ? ' mobile-bottom-nav__link--active' : ''}`
          }
        >
          {({ isActive }) => (
            <span className="mobile-bottom-nav__link-body">
              <span className="mobile-bottom-nav__icon-wrap">
                {isActive && (
                  <motion.span
                    className="mobile-bottom-nav__active-disc"
                    layoutId="mobile-bottom-nav-active-pill"
                    transition={activePillTransition}
                  />
                )}
                <motion.span
                  className="mobile-bottom-nav__emoji"
                  aria-hidden
                  animate={{ scale: isActive ? 1.06 : 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                >
                  📚
                </motion.span>
              </span>
              <small>List Bab</small>
            </span>
          )}
        </NavLink>
        <AnimatePresence initial={false} mode="popLayout">
          {showSyiirLayoutToggle && (
            <motion.button
              key="mobile-nav-syiir-layout"
              type="button"
              className="mobile-bottom-nav-syiir"
              onClick={onToggleSyiirLayout}
              aria-label={
                syiirLayoutMode === 'paired'
                  ? 'Syi\'ir: satu baris berdampingan. Alihkan ke dua baris kanan–kiri'
                  : 'Syi\'ir: dua baris. Alihkan ke satu baris berdampingan'
              }
              title={
                syiirLayoutMode === 'paired'
                  ? 'Syi\'ir sejajar — ketuk untuk dua baris'
                  : 'Syi\'ir dua baris — ketuk untuk sejajar'
              }
              initial={{ opacity: 0, x: 14, scale: 0.92 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 14, scale: 0.92 }}
              transition={readerNavItemTransition}
            >
              <span className="mobile-bottom-nav__icon-wrap mobile-bottom-nav-syiir__icon">
                <SyiirLayoutToggleIcon mode={syiirLayoutMode} />
              </span>
              <small>Syi&apos;ir</small>
            </motion.button>
          )}
          {showReaderFontSettings && (
            <motion.button
              key="mobile-nav-reader-font"
              type="button"
              className="mobile-bottom-nav-settings"
              onClick={onReaderFontSettings}
              aria-label="Pengaturan ukuran teks"
              initial={{ opacity: 0, x: 14, scale: 0.92 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 14, scale: 0.92 }}
              transition={readerNavItemTransition}
            >
              <span className="mobile-bottom-nav__icon-wrap mobile-bottom-nav-settings__icon">
                <span className="mobile-bottom-nav-settings__mark">Aa</span>
              </span>
              <small>Teks</small>
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>
    </nav>
  )
}
