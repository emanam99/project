import { useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuthStore } from '../../store/authStore'
import { ACCESS_GROUP } from '../../config/accessGroups'
import { getSidebarGroups } from '../../navigation/sidebarNav'
import { isNavPathActive } from '../../navigation/navActive'
import { IconForNavPath } from '../../navigation/navIcons'
import { useSantriBiodata } from '../../hooks/useSantriCachedResources'
import { isSantriGuruTugas } from '../../utils/santriGuruTugas'
import { ACCESS_MODE } from '../../config/accessMode'
import { PageEnter } from '../../components/motion/PageEnter'
import { BOTTOM_NAV_MENU_PATH } from '../../navigation/bottomNavConfig'

const VIEW_STORAGE_KEY = 'mybeddien_menu_view'

function readStoredView() {
  if (typeof window === 'undefined') return 'list'
  try {
    const v = localStorage.getItem(VIEW_STORAGE_KEY)
    return v === 'grid' ? 'grid' : 'list'
  } catch {
    return 'list'
  }
}

function GridViewIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
      />
    </svg>
  )
}

function ListViewIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

function normalizeQuery(q) {
  return q.trim().toLowerCase()
}

function itemLinkClass(active, grid) {
  if (grid) {
    return `flex min-w-0 flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 text-center transition-colors ${
      active
        ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-500/20 dark:bg-primary-900/45 dark:text-primary-300 dark:ring-primary-400/25'
        : 'text-gray-700 hover:bg-gray-100/90 dark:text-gray-200 dark:hover:bg-gray-700/50'
    }`
  }
  return `flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors ${
    active
      ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-500/20 dark:bg-primary-900/45 dark:text-primary-300 dark:ring-primary-400/25'
      : 'text-gray-700 hover:bg-gray-100/90 dark:text-gray-200 dark:hover:bg-gray-700/50'
  }`
}

function iconWrapClass(active) {
  return `flex shrink-0 items-center justify-center rounded-full ${
    active
      ? 'bg-primary-100 text-primary-600 dark:bg-primary-800/60 dark:text-primary-300'
      : 'bg-gray-100 text-gray-500 dark:bg-gray-700/80 dark:text-gray-400'
  }`
}

const searchExpandSpring = { type: 'spring', stiffness: 360, damping: 34, mass: 0.85 }
const iconPopSpring = { type: 'spring', stiffness: 420, damping: 28 }
const viewIconSpring = { type: 'spring', stiffness: 420, damping: 26 }
const viewLayoutSpring = { type: 'spring', stiffness: 380, damping: 30, mass: 0.82 }
const viewSwitchFade = { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }

function MenuItemLink({ item, active, grid, iconDelay, animateOnMount = true }) {
  return (
    <NavLink to={item.path} end className={itemLinkClass(active, grid)}>
      <motion.span
        className={`${iconWrapClass(active)} ${grid ? 'h-10 w-10' : 'h-11 w-11'}`}
        initial={animateOnMount ? { opacity: 0, scale: 0.45 } : false}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...iconPopSpring, delay: animateOnMount ? iconDelay : 0 }}
      >
        <IconForNavPath path={item.path} className={grid ? 'h-4 w-4' : 'h-5 w-5'} />
      </motion.span>
      <motion.span
        className={`${grid ? 'line-clamp-2 w-full text-[0.625rem] leading-tight' : 'text-sm'} ${
          active ? 'font-semibold' : 'font-medium'
        }`}
        initial={animateOnMount ? { opacity: 0, y: 4 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: animateOnMount ? iconDelay + 0.03 : 0, duration: 0.2 }}
      >
        {item.label}
      </motion.span>
    </NavLink>
  )
}

function ViewModeToggle({ view, onChange, className = '' }) {
  const isGrid = view === 'grid'
  const nextView = isGrid ? 'list' : 'grid'

  return (
    <motion.button
      type="button"
      onClick={() => onChange(nextView)}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 transition-colors hover:bg-primary-200/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 dark:bg-primary-800/70 dark:text-primary-200 dark:hover:bg-primary-800 ${className}`}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileTap={{ scale: 0.88 }}
      transition={{ ...searchExpandSpring, delay: 0.24 }}
      aria-label={isGrid ? 'Ubah ke tampilan daftar' : 'Ubah ke tampilan grid'}
      aria-pressed={isGrid}
    >
      <span className="relative flex h-5 w-5 items-center justify-center perspective-[320px]" aria-hidden>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={view}
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0, rotateY: -90, scale: 0.5 }}
            animate={{ opacity: 1, rotateY: 0, scale: 1 }}
            exit={{ opacity: 0, rotateY: 90, scale: 0.5 }}
            transition={viewIconSpring}
          >
            {isGrid ? (
              <GridViewIcon className="h-5 w-5" />
            ) : (
              <ListViewIcon className="h-5 w-5" />
            )}
          </motion.span>
        </AnimatePresence>
      </span>
    </motion.button>
  )
}

function MenuTitleBlock() {
  return (
    <motion.div
      className="min-w-0"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04, type: 'spring', stiffness: 380, damping: 32 }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-primary-600 dark:text-primary-400 lg:text-[11px]">
        Workspace
      </p>
      <h1 className="truncate text-base font-bold tracking-tight text-gray-900 dark:text-white lg:text-lg">
        Menu
      </h1>
    </motion.div>
  )
}

function MenuSearchRow({ query, setQuery, view, setViewMode, className = '' }) {
  return (
    <motion.div
      className={`flex items-center gap-2 ${className}`}
      initial={false}
    >
      <motion.div
        className="min-w-0 flex-1 overflow-hidden max-lg:max-w-none lg:max-w-68"
        initial={{ scaleX: 0.14, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        style={{ transformOrigin: 'right center' }}
        transition={{ ...searchExpandSpring, delay: 0.1 }}
      >
        <label className="relative block w-full">
          <span className="sr-only">Cari menu</span>
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari menu…"
            autoComplete="off"
            data-no-tab-swipe
            className="w-full rounded-full border border-gray-200/90 bg-gray-50/90 py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none ring-primary-500/30 placeholder:text-gray-400 focus:border-primary-400 focus:bg-white focus:ring-2 dark:border-gray-600 dark:bg-gray-800/80 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-primary-500 dark:focus:bg-gray-800"
          />
        </label>
      </motion.div>
      <ViewModeToggle view={view} onChange={setViewMode} />
    </motion.div>
  )
}

function MenuGroupSection({
  group,
  isGrid,
  pathname,
  iconIndexRef,
  baseIconDelay,
  iconStagger,
  columnLayout,
  showTopBorder,
}) {
  const gridClass = isGrid
    ? columnLayout
      ? 'grid grid-cols-2 gap-1.5 xl:grid-cols-3 xl:gap-2'
      : 'grid grid-cols-3 gap-1.5 lg:grid-cols-4 lg:gap-2'
    : 'space-y-1'

  return (
    <section>
      {showTopBorder && (
        <motion.div
          className="mb-4 border-t border-gray-200/90 dark:border-gray-700/90 lg:hidden"
          aria-hidden
        />
      )}
      <motion.p
        className="mb-2 px-1 text-[0.65rem] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: baseIconDelay + iconIndexRef.current * iconStagger - 0.02 }}
      >
        {group.label}
      </motion.p>
      <motion.ul layout className={gridClass} transition={viewLayoutSpring}>
        {group.items.map((item, itemIdx) => {
          const active = isNavPathActive(pathname, item.path)
          const iconDelay = baseIconDelay + iconIndexRef.current * iconStagger
          iconIndexRef.current += 1
          return (
            <motion.li
              key={item.path}
              layout
              initial={{ opacity: 0, scale: 0.88, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ ...viewLayoutSpring, delay: itemIdx * 0.028 }}
            >
              <MenuItemLink
                item={item}
                active={active}
                grid={isGrid}
                iconDelay={iconDelay}
                animateOnMount={false}
              />
            </motion.li>
          )
        })}
      </motion.ul>
    </section>
  )
}

function MenuGroupsList({ groups, isGrid, pathname, layout }) {
  const iconIndexRef = { current: 0 }
  const baseIconDelay = 0.28
  const iconStagger = 0.055

  if (layout === 'stack') {
    return (
      <ul className="space-y-5">
        {groups.map((group, gi) => (
          <li key={group.id}>
            <MenuGroupSection
              group={group}
              isGrid={isGrid}
              pathname={pathname}
              iconIndexRef={iconIndexRef}
              baseIconDelay={baseIconDelay}
              iconStagger={iconStagger}
              columnLayout={false}
              showTopBorder={gi > 0}
            />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-x-8 lg:gap-y-0">
      <div>
        {groups.left && (
          <MenuGroupSection
            group={groups.left}
            isGrid={isGrid}
            pathname={pathname}
            iconIndexRef={iconIndexRef}
            baseIconDelay={baseIconDelay}
            iconStagger={iconStagger}
            columnLayout
            showTopBorder={false}
          />
        )}
      </div>
      <motion.div className="space-y-6 lg:border-l lg:border-gray-200/80 lg:pl-8 dark:lg:border-gray-700/80">
        {groups.right.map((group, gi) => (
          <MenuGroupSection
            key={group.id}
            group={group}
            isGrid={isGrid}
            pathname={pathname}
            iconIndexRef={iconIndexRef}
            baseIconDelay={baseIconDelay}
            iconStagger={iconStagger}
            columnLayout
            showTopBorder={gi > 0}
          />
        ))}
      </motion.div>
    </div>
  )
}

export default function MenuPage() {
  const location = useLocation()
  const { user, activeAccess } = useAuthStore()
  const { biodata } = useSantriBiodata()
  const isGuruTugas = activeAccess === ACCESS_MODE.santri && isSantriGuruTugas(biodata)
  const groups = getSidebarGroups(user, activeAccess, { isGuruTugas })
  const [query, setQuery] = useState('')
  const [view, setView] = useState(readStoredView)

  const setViewMode = (mode) => {
    setView(mode)
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, mode)
    } catch {
      /* abaikan */
    }
  }

  const filteredGroups = useMemo(() => {
    const stripMenuEntry = (list) =>
      list
        .map((g) => ({
          ...g,
          items: g.items.filter((item) => item.path !== BOTTOM_NAV_MENU_PATH),
        }))
        .filter((g) => g.items.length > 0)

    const nq = normalizeQuery(query)
    if (!nq) return stripMenuEntry(groups)
    return stripMenuEntry(
      groups
        .map((g) => ({
          ...g,
          items: g.items.filter(
            (item) =>
              item.label.toLowerCase().includes(nq) || g.label.toLowerCase().includes(nq)
          ),
        }))
        .filter((g) => g.items.length > 0)
    )
  }, [groups, query])

  const desktopGroups = useMemo(() => {
    const workspace = filteredGroups.find((g) => g.id === ACCESS_GROUP.workspace) ?? null
    const moduleGroups = filteredGroups.filter((g) => g.id !== ACCESS_GROUP.workspace)
    if (!workspace && moduleGroups.length === 0) return null
    if (!workspace) {
      const mid = Math.ceil(moduleGroups.length / 2)
      return {
        left: moduleGroups[0] ?? null,
        right: moduleGroups.slice(mid > 0 ? 1 : 0),
      }
    }
    return { left: workspace, right: moduleGroups }
  }, [filteredGroups])

  const isGrid = view === 'grid'

  return (
    <PageEnter className="flex h-full min-h-0 flex-col px-2 pb-2 pt-1 lg:px-4 xl:px-6">
      <motion.div
        className="mx-auto flex h-full min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-[2.25rem] border border-white/70 bg-white/92 shadow-[0_16px_48px_-12px_rgba(23,97,172,0.22)] backdrop-blur-xl lg:max-w-4xl xl:max-w-5xl dark:border-gray-600/50 dark:bg-gray-900/90 dark:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.45)]"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 360, damping: 34 }}
      >
        <motion.div
          className="shrink-0 border-b border-gray-200/80 px-4 pb-3 pt-4 lg:px-6 lg:pb-4 lg:pt-5 dark:border-gray-700/80"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.25 }}
        >
          {/* Mobile: judul atas, cari bawah */}
          <div className="lg:hidden">
            <div className="mb-3">
              <MenuTitleBlock />
            </div>
            <MenuSearchRow query={query} setQuery={setQuery} view={view} setViewMode={setViewMode} />
          </div>

          {/* Desktop: judul kiri, cari + toggle kanan */}
          <motion.div
            className="hidden lg:grid lg:grid-cols-2 lg:items-end lg:gap-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.06 }}
          >
            <MenuTitleBlock />
            <MenuSearchRow
              query={query}
              setQuery={setQuery}
              view={view}
              setViewMode={setViewMode}
              className="justify-end"
            />
          </motion.div>
        </motion.div>

        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 lg:px-6 lg:py-4">
          {filteredGroups.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Tidak ada menu yang cocok dengan pencarian.
            </p>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={view}
                initial={{ opacity: 0, scale: 0.985 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.985 }}
                transition={viewSwitchFade}
              >
              <div className="lg:hidden">
                <MenuGroupsList groups={filteredGroups} isGrid={isGrid} pathname={location.pathname} layout="stack" />
              </div>
              {desktopGroups && (
                <div className="hidden lg:block">
                  <MenuGroupsList
                    groups={desktopGroups}
                    isGrid={isGrid}
                    pathname={location.pathname}
                    layout="columns"
                  />
                </div>
              )}
              </motion.div>
            </AnimatePresence>
          )}
        </nav>
      </motion.div>
    </PageEnter>
  )
}
