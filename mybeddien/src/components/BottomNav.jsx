import { memo } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { motion, LayoutGroup } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import { getBottomNavItems, BOTTOM_NAV_MENU_PATH } from '../navigation/bottomNavConfig'
import { isNavPathActive } from '../navigation/navActive'
import { useSantriBiodata } from '../hooks/useSantriCachedResources'
import { isSantriGuruTugas } from '../utils/santriGuruTugas'
import { ACCESS_MODE } from '../config/accessMode'
import { MenuChevronIcon } from '../navigation/navIcons'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'

const springSnappy = { type: 'spring', stiffness: 520, damping: 34 }

const activePillClass =
  'bg-primary-500/14 ring-1 ring-primary-500/22 dark:bg-primary-400/18 dark:ring-primary-400/28'

const menuPillIdleClass =
  'bg-slate-100/95 ring-1 ring-slate-300/70 dark:bg-slate-700/90 dark:ring-slate-500/55'

const menuPillActiveClass =
  'bg-slate-200/95 ring-2 ring-slate-400/65 dark:bg-slate-600/95 dark:ring-slate-400/55'

function BottomNavItem({ item, reducedMotion }) {
  const location = useLocation()
  const active = isNavPathActive(location.pathname, item.path)
  const Icon = item.icon
  const tap = reducedMotion ? {} : { scale: 0.92 }

  return (
    <NavLink
      to={item.path}
      className="relative flex h-full shrink-0"
      aria-current={active ? 'page' : undefined}
    >
      <motion.div
        className="relative flex flex-col items-center justify-center px-0.5 py-1.5"
        initial={false}
        whileTap={tap}
      >
        <span className="relative flex min-h-11 min-w-10 flex-col items-center justify-center gap-0.5 rounded-full px-1.5 py-1">
          {active && (
            <motion.span
              layoutId="bottom-nav-active-pill"
              className={`absolute inset-0 rounded-full ${activePillClass}`}
              transition={springSnappy}
            />
          )}
          <Icon
            className={`relative z-10 h-[1.25rem] w-[1.25rem] transition-colors duration-200 ${
              active
                ? 'text-primary-600 dark:text-primary-300'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          />
          <span
            className={`relative z-10 max-w-14 truncate text-center leading-tight ${
              active
                ? 'text-[0.5625rem] font-semibold text-primary-700 dark:text-primary-300'
                : 'text-[0.5rem] font-medium text-gray-500 dark:text-gray-400'
            }`}
          >
            {item.label}
          </span>
        </span>
      </motion.div>
    </NavLink>
  )
}

function BottomNavMenuItem({ reducedMotion }) {
  const location = useLocation()
  const active = isNavPathActive(location.pathname, BOTTOM_NAV_MENU_PATH)
  const tap = reducedMotion ? {} : { scale: 0.92 }

  return (
    <NavLink
      to={BOTTOM_NAV_MENU_PATH}
      className="relative flex h-full shrink-0"
      aria-current={active ? 'page' : undefined}
    >
      <motion.div
        className="relative flex flex-col items-center justify-center px-0.5 py-1.5"
        initial={false}
        whileTap={tap}
      >
        <span
          className={`relative flex min-h-11 min-w-10 flex-col items-center justify-center gap-0.5 rounded-full px-1.5 py-1 transition-colors duration-200 ${
            active ? menuPillActiveClass : menuPillIdleClass
          }`}
        >
          <MenuChevronIcon
            className={`h-[1.25rem] w-[1.25rem] ${
              active
                ? 'text-slate-800 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          />
          <span
            className={`max-w-12 truncate text-center leading-tight ${
              active
                ? 'text-[0.5625rem] font-semibold text-slate-800 dark:text-slate-100'
                : 'text-[0.5rem] font-semibold text-slate-600 dark:text-slate-300'
            }`}
          >
            Menu
          </span>
        </span>
      </motion.div>
    </NavLink>
  )
}

function BottomNav() {
  const user = useAuthStore((s) => s.user)
  const activeAccess = useAuthStore((s) => s.activeAccess)
  const { biodata } = useSantriBiodata()
  const isGuruTugas = activeAccess === ACCESS_MODE.santri && isSantriGuruTugas(biodata)
  const navItems = getBottomNavItems(user, activeAccess, { isGuruTugas })
  const reducedMotion = usePrefersReducedMotion()

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-100 flex justify-center sm:hidden"
      style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <nav
        className="pointer-events-auto relative inline-flex h-15 w-max max-w-[calc(100vw-1.5rem)] items-stretch overflow-hidden rounded-full border border-white/70 bg-white/88 px-0.5 shadow-[0_10px_36px_-10px_rgba(23,97,172,0.28),0_6px_20px_-8px_rgba(0,0,0,0.16)] backdrop-blur-2xl dark:border-gray-600/55 dark:bg-gray-900/82 dark:shadow-[0_10px_36px_-10px_rgba(0,0,0,0.5)]"
        aria-label="Navigasi bawah"
      >
        <div
          className="pointer-events-none absolute inset-x-4 top-0 h-px bg-linear-to-r from-transparent via-white/90 to-transparent dark:via-white/15"
          aria-hidden
        />

        <LayoutGroup id="bottom-nav">
          <div className="flex items-stretch gap-0">
            {navItems.map((item) => (
              <BottomNavItem key={item.path} item={item} reducedMotion={reducedMotion} />
            ))}
            <BottomNavMenuItem reducedMotion={reducedMotion} />
          </div>
        </LayoutGroup>
      </nav>
    </div>
  )
}

export default memo(BottomNav)
