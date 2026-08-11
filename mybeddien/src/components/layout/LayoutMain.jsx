import { Suspense } from 'react'
import { useLocation } from 'react-router-dom'
import AnimatedOutlet from '../AnimatedOutlet'
import PageLoader from '../PageLoader'
import { BOTTOM_NAV_MENU_PATH } from '../../navigation/bottomNavConfig'

/** Area konten halaman saja — padding mengikuti rute; shell (sidebar/header/nav) di luar. */
export default function LayoutMain() {
  const { pathname } = useLocation()
  const isMenuPage = pathname === BOTTOM_NAV_MENU_PATH

  return (
    <main
      className={`relative z-0 flex-1 min-h-0 overflow-hidden sm:pb-0 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] ${
        isMenuPage ? 'px-0' : 'px-2 sm:px-3'
      }`}
    >
      <Suspense fallback={<PageLoader />}>
        <AnimatedOutlet />
      </Suspense>
    </main>
  )
}
