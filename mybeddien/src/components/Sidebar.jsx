import { memo, useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import { useSidebarStore } from '../store/sidebarStore'
import { getGambarUrl } from '../config/images'
import { getSidebarGroups } from '../navigation/sidebarNav'
import { IconForNavPath } from '../navigation/navIcons'
import { isNavPathActive } from '../navigation/navActive'
import { useSantriBiodata } from '../hooks/useSantriCachedResources'
import { isSantriGuruTugas } from '../utils/santriGuruTugas'
import { ACCESS_MODE } from '../config/accessMode'

function navLinkClass(active, collapsed) {
  if (collapsed) {
    return `flex items-center h-12 justify-center rounded-lg mx-1 transition-colors duration-200 ${
      active
        ? 'bg-primary-50 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400'
        : 'text-gray-500 dark:text-gray-400 hover:bg-primary-50/90 dark:hover:bg-primary-900/30 hover:text-primary-600 dark:hover:text-primary-400'
    }`
  }
  return `flex items-center h-11 gap-3 px-3 rounded-lg mx-1 text-sm font-medium transition-colors duration-200 ${
    active
      ? 'bg-primary-50 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400 font-semibold shadow-sm'
      : 'text-gray-500 dark:text-gray-400 hover:bg-primary-50/80 dark:hover:bg-primary-900/25 hover:text-primary-600 dark:hover:text-primary-400'
  }`
}

function Sidebar() {
  const user = useAuthStore((s) => s.user)
  const activeAccess = useAuthStore((s) => s.activeAccess)
  const { biodata } = useSantriBiodata()
  const isGuruTugas = activeAccess === ACCESS_MODE.santri && isSantriGuruTugas(biodata)
  const groups = useMemo(
    () => getSidebarGroups(user, activeAccess, { isGuruTugas }),
    [user, activeAccess, isGuruTugas]
  )
  const { isCollapsed, toggleCollapsed } = useSidebarStore()

  const [collapsedMap, setCollapsedMap] = useState({})
  const isGroupOpen = (id) => collapsedMap[id] !== true
  const toggleGroup = (id) => {
    setCollapsedMap((m) => ({ ...m, [id]: !m[id] }))
  }

  const flatItems = useMemo(() => {
    const out = []
    for (const g of groups) {
      for (const item of g.items) {
        out.push({ ...item, groupId: g.id, groupLabel: g.label })
      }
    }
    return out
  }, [groups])

  const location = useLocation()

  return (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 80 : 256 }}
      transition={{ type: 'tween', duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
      className="hidden sm:flex flex-col shrink-0 h-full min-h-0 bg-white dark:bg-gray-800 shadow-lg border-r border-gray-200/80 dark:border-gray-700/80 overflow-hidden"
    >
      <div className="flex items-center justify-center h-20 shrink-0 shadow-md bg-primary-600 dark:bg-primary-800 overflow-hidden px-2">
        <AnimatePresence mode="wait">
          {isCollapsed ? (
            <motion.img
              key="collapsed-logo"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.2 }}
              src={getGambarUrl('/icon/mybeddienlogo.png')}
              alt="myBeddien"
              className="h-11 w-11 object-contain"
            />
          ) : (
            <motion.img
              key="expanded-logo"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              src={getGambarUrl('/icon/mybeddientextputih.png')}
              alt="myBeddien"
              className="h-9 w-auto max-w-[200px] object-contain object-center drop-shadow-sm"
            />
          )}
        </AnimatePresence>
      </div>

      <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden sidebar-scroll min-h-0">
        {isCollapsed ? (
          <ul className="space-y-0.5 px-1.5">
            {flatItems.map((item, index) => {
              const prev = flatItems[index - 1]
              const showDivider = index > 0 && prev && prev.groupId !== item.groupId
              const active = isNavPathActive(location.pathname, item.path)
              return (
                <li key={`${item.groupId}-${item.path}`}>
                  {showDivider ? (
                    <div className="mx-1 my-2 border-t border-gray-200 dark:border-gray-700" aria-hidden="true" />
                  ) : null}
                  <NavLink
                    to={item.path}
                    title={`${item.groupLabel}: ${item.label}`}
                    className={navLinkClass(active, true)}
                    aria-current={active ? 'page' : undefined}
                  >
                    <span
                      className={`inline-flex items-center justify-center h-11 w-11 ${
                        active ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500'
                      }`}
                    >
                      <IconForNavPath path={item.path} className="w-6 h-6" />
                    </span>
                  </NavLink>
                </li>
              )
            })}
          </ul>
        ) : (
          <ul className="space-y-2 px-2">
            {groups.map((group) => {
              const open = isGroupOpen(group.id)
              return (
                <li key={group.id} className="mb-0.5">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className="flex items-center w-full h-9 px-2 rounded-lg mx-1 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <motion.span animate={{ rotate: open ? 0 : -90 }} className="shrink-0 mr-1.5 text-gray-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </motion.span>
                    <span className="truncate">{group.label}</span>
                  </button>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.ul
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden space-y-0.5 pt-0.5"
                      >
                        {group.items.map((item) => {
                          const active = isNavPathActive(location.pathname, item.path)
                          return (
                            <li key={item.path}>
                              <NavLink
                                to={item.path}
                                className={navLinkClass(active, false)}
                                aria-current={active ? 'page' : undefined}
                              >
                                <span
                                  className={`inline-flex items-center justify-center w-9 h-9 shrink-0 rounded-lg ${
                                    active
                                      ? 'text-primary-600 dark:text-primary-400 bg-white/90 dark:bg-gray-800/80'
                                      : 'text-gray-400 dark:text-gray-500'
                                  }`}
                                >
                                  <IconForNavPath path={item.path} className="w-5 h-5" />
                                </span>
                                <span className="truncate">{item.label}</span>
                              </NavLink>
                            </li>
                          )
                        })}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </li>
              )
            })}
          </ul>
        )}
      </nav>

      <div className="p-2 border-t border-gray-200 dark:border-gray-700 shrink-0">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="w-full flex items-center justify-center p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none transition-colors"
          aria-label={isCollapsed ? 'Buka sidebar' : 'Tutup sidebar'}
        >
          <motion.svg
            animate={{ rotate: isCollapsed ? 180 : 0 }}
            className="w-6 h-6 transition-transform duration-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </motion.svg>
        </button>
      </div>
    </motion.aside>
  )
}

export default memo(Sidebar)
