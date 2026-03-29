import { useMemo, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuthStore } from '../../../store/authStore'
import { userHasSuperAdminAccess } from '../../../utils/roleAccess'
import { GROUP_ORDER } from '../../../config/menuConfig'
import { buildFlatNavMenusFromFitur } from '../../../utils/menuCatalogNav'
import { getMenuIcon } from '../Beranda/index.jsx'

/** Warna per item seperti di Beranda — hanya dipakai untuk icon, kartu tanpa bg/border */
const menuColorSets = [
  { cardBg: 'bg-teal-100 dark:bg-teal-900/40', iconText: 'text-teal-600 dark:text-teal-400' },
  { cardBg: 'bg-emerald-100 dark:bg-emerald-900/40', iconText: 'text-emerald-600 dark:text-emerald-400' },
  { cardBg: 'bg-blue-100 dark:bg-blue-900/40', iconText: 'text-blue-600 dark:text-blue-400' },
  { cardBg: 'bg-violet-100 dark:bg-violet-900/40', iconText: 'text-violet-600 dark:text-violet-400' },
  { cardBg: 'bg-amber-100 dark:bg-amber-900/40', iconText: 'text-amber-600 dark:text-amber-400' },
  { cardBg: 'bg-rose-100 dark:bg-rose-900/40', iconText: 'text-rose-600 dark:text-rose-400' },
  { cardBg: 'bg-cyan-100 dark:bg-cyan-900/40', iconText: 'text-cyan-600 dark:text-cyan-400' },
  { cardBg: 'bg-indigo-100 dark:bg-indigo-900/40', iconText: 'text-indigo-600 dark:text-indigo-400' },
  { cardBg: 'bg-orange-100 dark:bg-orange-900/40', iconText: 'text-orange-600 dark:text-orange-400' },
  { cardBg: 'bg-pink-100 dark:bg-pink-900/40', iconText: 'text-pink-600 dark:text-pink-400' },
]
function getMenuColor(path, index) {
  return menuColorSets[index % menuColorSets.length]
}

const easing = [0.22, 1, 0.36, 1]
const pageVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3, ease: easing } }
}
const blockVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.05 * Math.min(i, 4), duration: 0.4, ease: easing }
  })
}
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.03 * (i % 8), duration: 0.35, ease: easing }
  })
}

/** Katalog DB: Tanpa Tentang di daftar. Cadangan statis: semua grup termasuk Tentang. */
const SEMUA_MENU_GROUP_ORDER_DB = GROUP_ORDER.filter((g) => g !== 'Tentang' && g !== 'Super Admin')
const SEMUA_MENU_GROUP_ORDER_FULL = GROUP_ORDER.filter((g) => g !== 'Super Admin')

export default function SemuaMenu() {
  const { user } = useAuthStore()
  const fiturMenuFromApi = useAuthStore((s) => s.fiturMenuFromApi)
  const fiturMenuCatalog = useAuthStore((s) => s.fiturMenuCatalog)
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)
  const fiturMenuFetchStatus = useAuthStore((s) => s.fiturMenuFetchStatus)
  const navigate = useNavigate()
  const scrollRef = useRef(null)
  const [searchQuery, setSearchQuery] = useState('')

  const isSuperAdmin = userHasSuperAdminAccess(user)

  const menuCatalogForIcons = useMemo(() => {
    const c = Array.isArray(fiturMenuCatalog) ? [...fiturMenuCatalog] : []
    const a = Array.isArray(fiturMenuFromApi)
      ? fiturMenuFromApi.filter((it) => (it.type || 'menu') === 'menu')
      : []
    return [...a, ...c]
  }, [fiturMenuFromApi, fiturMenuCatalog])

  const { allowedMenus, groupOrderForPage, menuSource } = useMemo(() => {
    const { menus, source } = buildFlatNavMenusFromFitur({
      fiturMenuFromApi,
      fiturMenuCatalog,
      fiturMenuCodes,
      isSuperAdmin,
      fiturMenuFetchStatus
    })
    if (source === 'loading') {
      return {
        allowedMenus: [],
        groupOrderForPage: SEMUA_MENU_GROUP_ORDER_DB,
        menuSource: 'loading'
      }
    }
    const flat = menus.filter((item) => item.group !== 'Tentang')
    const groupOrderForPage =
      source === 'static-fallback' ? SEMUA_MENU_GROUP_ORDER_FULL : SEMUA_MENU_GROUP_ORDER_DB
    return { allowedMenus: flat, groupOrderForPage, menuSource: source }
  }, [
    isSuperAdmin,
    fiturMenuFromApi,
    fiturMenuCatalog,
    fiturMenuCodes,
    fiturMenuFetchStatus
  ])

  const menusByGroup = useMemo(() => {
    const map = new Map()
    for (const item of allowedMenus) {
      const g = item.group || 'Lainnya'
      if (!map.has(g)) map.set(g, [])
      map.get(g).push(item)
    }
    return map
  }, [allowedMenus])

  const orderedGroups = useMemo(() => {
    const seen = new Set()
    const result = []
    for (const g of groupOrderForPage) {
      if (menusByGroup.has(g)) {
        result.push({ name: g, items: menusByGroup.get(g) })
        seen.add(g)
      }
    }
    menusByGroup.forEach((items, name) => {
      if (!seen.has(name)) result.push({ name, items })
    })
    return result
  }, [menusByGroup, groupOrderForPage])

  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return orderedGroups
    return orderedGroups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            (item.label && item.label.toLowerCase().includes(q)) ||
            (item.group && item.group.toLowerCase().includes(q))
        )
      }))
      .filter((group) => group.items.length > 0)
  }, [orderedGroups, searchQuery])

  return (
    <motion.div
      ref={scrollRef}
      className="h-full min-h-0 overflow-y-auto overflow-x-hidden"
      variants={pageVariants}
      initial="hidden"
      animate="visible"
    >
      <div className="max-w-2xl md:max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-12">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-5 text-center tracking-tight">
          Semua Menu
        </h1>
        <div className="relative mb-6">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari menu..."
            disabled={menuSource === 'loading'}
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-white dark:bg-gray-800/90 border border-gray-200 dark:border-gray-600/60 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 dark:focus:border-teal-400 transition-colors disabled:opacity-60"
            aria-label="Cari menu"
          />
        </div>
        {menuSource === 'loading' ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 text-sm">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-teal-500 border-t-transparent mb-3" />
            Memuat daftar menu…
          </div>
        ) : null}
        {/* Mobile: 1 kolom; PC/tablet (md+): 2 kolom. Wrapper + margin bawah tiap kotak agar spasi seragam, tidak ada yang berdempetan. */}
        {menuSource !== 'loading' ? (
        <div className="md:columns-2 md:gap-6 md:[column-fill:balance]">
          {filteredGroups.map(({ name, items }, groupIndex) => (
            <div key={name} className="mb-6 break-inside-avoid last:mb-0">
              <motion.section
                variants={blockVariants}
                custom={groupIndex}
                initial="hidden"
                whileInView="visible"
                viewport={{ root: scrollRef, once: true, amount: 0.15 }}
                className="rounded-xl border border-gray-200 dark:border-gray-700/60 bg-gray-50/50 dark:bg-gray-800/30 p-4 sm:p-5 h-fit min-h-0 w-full flex flex-col items-center text-center"
              >
              <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 px-0.5 w-full">
                {name}
              </h2>
              <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-3 gap-x-3 gap-y-4 w-full justify-items-center items-start">
                {items.map((item, itemIndex) => {
                  const c = getMenuColor(item.path, itemIndex)
                  return (
                    <motion.button
                      key={item.path}
                      type="button"
                      variants={itemVariants}
                      custom={groupIndex * 10 + itemIndex}
                      initial="hidden"
                      whileInView="visible"
                      viewport={{ root: scrollRef, once: true, amount: 0.2 }}
                      onClick={() => navigate(item.path)}
                      className="group flex flex-col items-center justify-start gap-2 w-full max-w-[5.5rem] sm:max-w-[6rem] min-w-0 px-1 py-2 sm:py-3 transition-all duration-200 text-gray-700 dark:text-gray-200 hover:opacity-90"
                    >
                      <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-200 ${c.cardBg} ${c.iconText}`}>
                        {getMenuIcon(item.path, 'w-5 h-5', menuCatalogForIcons)}
                      </span>
                      <span className="text-[11px] font-medium text-center leading-tight line-clamp-2 min-h-[2.25rem] flex items-center justify-center text-gray-600 dark:text-gray-300 group-hover:text-gray-800 dark:group-hover:text-gray-100 w-full">
                        {item.label}
                      </span>
                    </motion.button>
                  )
                })}
              </div>
            </motion.section>
            </div>
          ))}
        </div>
        ) : null}
      </div>
    </motion.div>
  )
}
