import { useLocation } from 'react-router-dom'
import AppHeader from './AppHeader'
import { BOTTOM_NAV_MENU_PATH } from '../../navigation/bottomNavConfig'

/**
 * Slot header tetap di DOM; hanya disembunyikan di halaman Menu (tanpa AnimatePresence unmount).
 */
export default function LayoutHeaderSlot() {
  const { pathname } = useLocation()
  const isMenuPage = pathname === BOTTOM_NAV_MENU_PATH

  return (
    <div
      className={`relative z-50 shrink-0 overflow-visible ${isMenuPage ? 'hidden' : ''}`}
      aria-hidden={isMenuPage}
    >
      <AppHeader />
    </div>
  )
}
