import { NavLink, useLocation, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useSidebarStore } from '../../store/sidebarStore'
import api from '../../services/api'
import { getGambarUrl } from '../../config/images'
import { GROUP_ORDER } from '../../config/menuConfig'
import {
  userMatchesAllowedRolesOrPermissions,
  userHasSuperAdminAccess,
  userHasAnyAdminCap
} from '../../utils/roleAccess'
import { buildUnifiedSidebarNavFromFitur } from '../../utils/sidebarNavFromFiturApi'

const GROUP_LABELS = GROUP_ORDER

function Sidebar() {
  const { isCollapsed, toggleCollapsed } = useSidebarStore()
  const fiturMenuFromApi = useAuthStore((s) => s.fiturMenuFromApi)
  const fiturMenuCatalog = useAuthStore((s) => s.fiturMenuCatalog)
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)
  const fiturMenuFetchStatus = useAuthStore((s) => s.fiturMenuFetchStatus)
  const fetchFiturMenu = useAuthStore((s) => s.fetchFiturMenu)
  const fetchFiturMenuCatalog = useAuthStore((s) => s.fetchFiturMenuCatalog)

  const { user } = useAuthStore()
  const navItems = useMemo(
    () =>
      buildUnifiedSidebarNavFromFitur({
        fiturMenuFromApi,
        fiturMenuCatalog,
        fiturMenuCodes,
        isSuperAdmin: userHasSuperAdminAccess(user),
        fiturMenuFetchStatus
      }),
    [fiturMenuFromApi, fiturMenuCatalog, fiturMenuCodes, fiturMenuFetchStatus, user]
  )

  // Pastikan katalog + my-menu segar (menu baru seperti Alumni ikut di sidebar).
  useEffect(() => {
    fetchFiturMenu({ background: true }).catch(() => {})
    fetchFiturMenuCatalog().catch(() => {})
  }, [fetchFiturMenu, fetchFiturMenuCatalog])
  const [isScrolling, setIsScrolling] = useState(false)
  const scrollTimeoutRef = useRef(null)
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const hasSuperAdminMenu = userHasSuperAdminAccess(user)
  const [aiMenuEnabled, setAiMenuEnabled] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.get('/deepseek/account')
        if (cancelled) return
        if (res?.data?.success) {
          setAiMenuEnabled(res.data?.data?.ai_enabled !== false)
        }
      } catch (_) {
        if (!cancelled) setAiMenuEnabled(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Ambil NIS/ID dari URL (pembayaran pakai nis, pendaftaran pakai id; bawa keduanya agar data santri tetap)
  const idFromUrl = searchParams.get('nis') || searchParams.get('id')

  // Indeks grup per item (berdasarkan urutan asli navItems); pembatas selalu antara beda grup
  const groupIndices = useMemo(() => {
    const out = []
    let g = 0
    for (let i = 0; i < navItems.length; i++) {
      out[i] = g
      if (navItems[i].showSeparatorAfter) g++
    }
    return out
  }, [navItems])

  // Filter menu: gabungan all_roles (role_key bisa "multi_role")
  const filteredNavItems = useMemo(() => {
    const matchRoles = (roles) => userMatchesAllowedRolesOrPermissions(user, roles)
    const permOk = (permission) => {
      if (!user || !user.permissions) return false
      return user.permissions.includes(permission)
    }
    const canSee = (item) => {
      if (item.path === '/chat-ai' && !aiMenuEnabled) {
        return false
      }
      if (item.path === '/settings/role-akses') {
        return hasSuperAdminMenu
      }
      if (item._fromApi) {
        return true
      }
      if (hasSuperAdminMenu) return true
      const userLevel = user?.level?.toLowerCase()
      if (item.requiresRole) return matchRoles(item.requiresRole)
      if (item.requiresSuperAdmin) return false
      if (item.requiresAdmin) return user && (userLevel === 'admin' || userHasAnyAdminCap(user))
      if (item.requiresPermission) return user && permOk(item.requiresPermission)
      return true
    }
    return navItems
      .map((item, i) => ({ item, groupIndex: groupIndices[i] }))
      .filter(({ item }) => canSee(item))
  }, [user, groupIndices, hasSuperAdminMenu, aiMenuEnabled])

  // Grup untuk accordion: { groupIndex, label, items }
  const navGroups = useMemo(() => {
    const byGroup = new Map()
    filteredNavItems.forEach((entry) => {
      const g = entry.groupIndex
      if (!byGroup.has(g)) {
        const label = entry.item.group ?? GROUP_LABELS[g] ?? 'Menu'
        byGroup.set(g, { groupIndex: g, label, items: [] })
      }
      byGroup.get(g).items.push(entry)
    })
    return Array.from(byGroup.values()).sort((a, b) => a.groupIndex - b.groupIndex)
  }, [filteredNavItems])

  const [openGroups, setOpenGroups] = useState(new Set())
  const [menuSearchQuery, setMenuSearchQuery] = useState('')

  const toggleGroup = (groupIndex) => {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupIndex)) next.delete(groupIndex)
      else next.add(groupIndex)
      return next
    })
  }
  const isGroupOpen = (groupIndex) => openGroups.has(groupIndex)

  // Buka accordion grup yang memuat path aktif (agar Alumni/dll. terlihat di sidebar).
  useEffect(() => {
    const path = location.pathname || ''
    const hit = filteredNavItems.find(({ item }) => {
      if (item.path === path || (item.path && path.startsWith(`${item.path}/`))) return true
      return (item.children || []).some(
        (ch) => ch.path === path || (ch.path && path.startsWith(`${ch.path}/`))
      )
    })
    if (!hit) return
    setOpenGroups((prev) => {
      if (prev.has(hit.groupIndex)) return prev
      const next = new Set(prev)
      next.add(hit.groupIndex)
      return next
    })
  }, [location.pathname, filteredNavItems])

  const [openSubmenus, setOpenSubmenus] = useState(() => new Set())

  useEffect(() => {
    const path = location.pathname || ''
    setOpenSubmenus((prev) => {
      let changed = false
      const next = new Set(prev)
      filteredNavItems.forEach(({ item }) => {
        const kids = item.children || []
        if (kids.length === 0) return
        const childActive = kids.some(
          (ch) => ch.path === path || (ch.path && path.startsWith(`${ch.path}/`))
        )
        const selfActive = item.path === path
        const key = item.fiturCode || item.path
        if ((childActive || selfActive) && !next.has(key)) {
          next.add(key)
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [location.pathname, filteredNavItems])

  const toggleSubmenu = (key) => {
    setOpenSubmenus((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const collapsedFlatEntries = useMemo(() => {
    const out = []
    filteredNavItems.forEach((entry) => {
      out.push(entry)
      ;(entry.item.children || []).forEach((ch) => {
        out.push({ item: ch, groupIndex: entry.groupIndex })
      })
    })
    return out
  }, [filteredNavItems])

  const filteredNavGroups = useMemo(() => {
    const q = menuSearchQuery.trim().toLowerCase()
    if (!q) return navGroups
    return navGroups
      .map((group) => ({
        ...group,
        items: group.items.filter(({ item }) => {
          if (
            (item.label && item.label.toLowerCase().includes(q)) ||
            (item.path && item.path.toLowerCase().includes(q))
          ) {
            return true
          }
          return (item.children || []).some(
            (ch) =>
              (ch.label && ch.label.toLowerCase().includes(q)) ||
              (ch.path && ch.path.toLowerCase().includes(q))
          )
        })
      }))
      .filter((group) => group.items.length > 0)
  }, [navGroups, menuSearchQuery])

  const collapsibleGroupIndices = useMemo(
    () => navGroups.map((group) => group.groupIndex),
    [navGroups]
  )

  const allGroupsCollapsed =
    collapsibleGroupIndices.length > 0 &&
    collapsibleGroupIndices.every((groupIndex) => !openGroups.has(groupIndex))

  const toggleAllGroupsExpanded = () => {
    if (collapsibleGroupIndices.length === 0) return
    if (allGroupsCollapsed) {
      setOpenGroups(new Set(collapsibleGroupIndices))
    } else {
      setOpenGroups(new Set())
    }
  }

  const isGroupOpenForDisplay = (groupIndex) => {
    if (menuSearchQuery.trim()) return true
    return isGroupOpen(groupIndex)
  }

  // Handle scroll untuk auto-hide scrollbar
  const handleScroll = () => {
    setIsScrolling(true)
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }
    scrollTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false)
    }, 1500)
  }

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [])

  const isActivePath = (path) => {
    if (path === '/dashboard-pembayaran') {
      return location.pathname === '/' || location.pathname === '/dashboard' || location.pathname === '/dashboard-pembayaran'
    }
    if (path === '/dashboard-umum') {
      return location.pathname === '/dashboard-umum'
    }
    if (path === '/dashboard-pendaftaran') {
      return location.pathname === '/dashboard-pendaftaran'
    }
    if (path === '/dashboard-ijin') {
      return location.pathname === '/dashboard-ijin'
    }
    // Untuk aktivitas tahun ajaran
    if (path === '/aktivitas-tahun-ajaran') {
      return location.pathname === '/aktivitas-tahun-ajaran'
    }
    // Untuk dashboard keuangan
    if (path === '/dashboard-keuangan') {
      return location.pathname === '/dashboard-keuangan'
    }
    // Untuk pendaftaran/item: aktif di /pendaftaran/item dan semua sub-rute (set, kondisi, …)
    if (path === '/pendaftaran/item') {
      return location.pathname === '/pendaftaran/item' || location.pathname.startsWith('/pendaftaran/item/')
    }
    // Untuk pendaftaran/data-pendaftar, cek path yang tepat
    if (path === '/pendaftaran/data-pendaftar') {
      return location.pathname === '/pendaftaran/data-pendaftar'
    }
    if (path === '/pendaftaran/analisis') {
      return location.pathname === '/pendaftaran/analisis'
    }
    // Untuk pendaftaran/padukan-data, cek path yang tepat
    if (path === '/pendaftaran/padukan-data') {
      return location.pathname === '/pendaftaran/padukan-data'
    }
    // Untuk pendaftaran/pengaturan, cek path yang tepat
    if (path === '/pendaftaran/pengaturan') {
      return location.pathname === '/pendaftaran/pengaturan'
    }
    // Untuk pendaftaran: hanya aktif ketika exact /pendaftaran atau subpath yang bukan menu sendiri (bukan item & sub-item, data-pendaftar, padukan-data, pengaturan)
    if (path === '/pendaftaran') {
      if (location.pathname !== '/pendaftaran' && !location.pathname.startsWith('/pendaftaran/')) return false
      if (location.pathname === '/pendaftaran/item' || location.pathname.startsWith('/pendaftaran/item/')) return false
      if (location.pathname === '/pendaftaran/data-pendaftar' || location.pathname === '/pendaftaran/analisis' || location.pathname === '/pendaftaran/padukan-data' || location.pathname === '/pendaftaran/pengaturan') return false
      if (location.pathname === '/pendaftaran/data') return false
      return true
    }
    // Umroh: dashboard exact; jamaah hanya jamaah (dan create, :id/edit); tabungan/laporan exact
    if (path === '/dashboard-umroh') return location.pathname === '/dashboard-umroh'
    if (path === '/umroh/jamaah') return location.pathname === '/umroh/jamaah' || location.pathname.startsWith('/umroh/jamaah/')
    if (path === '/umroh/tabungan') return location.pathname === '/umroh/tabungan'
    if (path === '/laporan-umroh') return location.pathname === '/laporan-umroh'
    // Untuk ijin: Data Ijin dan Data Boyong masing-masing exact path
    if (path === '/ijin/data-ijin') return location.pathname === '/ijin/data-ijin'
    if (path === '/ijin/data-boyong') return location.pathname === '/ijin/data-boyong'
    // Untuk kalender: exact path
    if (path === '/kalender') return location.pathname === '/kalender'
    if (path === '/converter') return location.pathname === '/converter'
    if (path === '/kalender/hari-penting') return location.pathname === '/kalender/hari-penting'
    if (path === '/kalender/pengaturan') return location.pathname === '/kalender/pengaturan'
    // Untuk juara, semua path juara dianggap aktif jika dimulai dengan /juara
    if (path === '/juara/data-juara') {
      return location.pathname.startsWith('/juara')
    }
    // UGT - Data Madrasah, Laporan, Koordinator
    if (path === '/ugt/data-madrasah') return location.pathname === '/ugt/data-madrasah'
    if (path === '/ugt/guru-tugas') return location.pathname === '/ugt/guru-tugas'
    if (path === '/ugt/kompas') return location.pathname === '/ugt/kompas'
    if (path === '/ugt/laporan') return location.pathname === '/ugt/laporan' || location.pathname.startsWith('/ugt/laporan/')
    if (path === '/koordinator') return location.pathname === '/koordinator'
    // Cashless - Data Toko, Top Up, Akun Cashless, Pengaturan
    if (path === '/cashless/data-toko') return location.pathname === '/cashless/data-toko'
    if (path === '/cashless/topup') return location.pathname === '/cashless/topup'
    // Grup My Workspace
    if (path === '/beranda') return location.pathname === '/beranda'
    if (path === '/mybeddian') return location.pathname === '/mybeddian'
    if (path === '/profil') return location.pathname === '/profil' || location.pathname.startsWith('/profil/')
    // Exact match untuk semua path termasuk /uwaba, /tunggakan, /khusus
    return location.pathname === path
  }

  const sidebarWidth = isCollapsed ? 'w-20' : 'w-64'

  return (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 80 : 256 }}
      className={`hidden sm:flex flex-col bg-white dark:bg-gray-800 shadow-lg transition-all duration-300 ease-in-out ${sidebarWidth} overflow-hidden h-full min-h-0`}
    >
      {/* Header */}
      <div className="flex items-center justify-center h-20 shadow-md bg-primary-600 dark:bg-primary-800 overflow-hidden flex-shrink-0">
        <AnimatePresence mode="wait">
          {isCollapsed ? (
            <motion.img
              key="collapsed"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              src={getGambarUrl('/icon/ebeddienlogoputih.png')}
              alt="eBeddien"
              className="h-12 w-12 transform scale-150"
              style={{ objectFit: 'contain' }}
            />
          ) : (
            <motion.img
              key="expanded"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              src={getGambarUrl('/icon/ebeddientextputih.png')}
              alt="eBeddien"
              className="h-12 w-25 transform scale-150"
              style={{ objectFit: 'cover' }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Pencarian menu & expand/collapse grup (desktop, sidebar terbuka) */}
      {!isCollapsed && navGroups.length > 0 && (
        <div className="px-2 py-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-teal-600 dark:text-teal-300 pointer-events-none">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="search"
                value={menuSearchQuery}
                onChange={(e) => setMenuSearchQuery(e.target.value)}
                placeholder="Cari menu..."
                aria-label="Cari menu"
                className="w-full h-9 pl-8 pr-3 rounded-full bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-700/60 text-xs text-gray-900 dark:text-gray-100 placeholder-teal-700/60 dark:placeholder-teal-300/70 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 dark:focus:border-teal-400 focus:bg-white dark:focus:bg-gray-900/60"
              />
            </div>

            {collapsibleGroupIndices.length > 0 && (
              <button
                type="button"
                onClick={toggleAllGroupsExpanded}
                className="shrink-0 w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700/60 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 flex items-center justify-center transition-colors"
                title={allGroupsCollapsed ? 'Buka semua grup' : 'Tutup semua grup'}
                aria-label={allGroupsCollapsed ? 'Buka semua grup menu' : 'Tutup semua grup menu'}
                aria-pressed={!allGroupsCollapsed}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={allGroupsCollapsed ? 'expand' : 'collapse'}
                    initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
                    animate={{ rotate: 0, opacity: 1, scale: 1 }}
                    exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    className="flex"
                  >
                    {allGroupsCollapsed ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7M19 15l-7 7-7-7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7M5 9l7-7 7 7" />
                      </svg>
                    )}
                  </motion.span>
                </AnimatePresence>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Navigation Items */}
      <ul
        className={`sidebar-scroll flex flex-col py-4 space-y-1 flex-1 overflow-y-auto overflow-x-hidden ${isScrolling ? 'scrollbar-visible' : ''}`}
        onScroll={handleScroll}
        onMouseEnter={() => setIsScrolling(true)}
        onMouseLeave={() => {
          setTimeout(() => setIsScrolling(false), 500)
        }}
      >
        {isCollapsed ? (
          /* Sidebar collapsed: tampilan flat dengan pembatas grup */
          collapsedFlatEntries.map((entry, index) => {
            const { item, groupIndex } = entry
            const isActive = isActivePath(item.path)
            const nextEntry = collapsedFlatEntries[index + 1]
            const shouldShowDivider = nextEntry != null && nextEntry.groupIndex !== groupIndex
            const pathsWithNis = ['/pendaftaran', '/uwaba', '/tunggakan', '/khusus']
            const shouldIncludeNis = pathsWithNis.includes(item.path) && idFromUrl && /^\d{7}$/.test(idFromUrl)
            const linkTo = shouldIncludeNis ? `${item.path}?nis=${idFromUrl}` : item.path
            return (
              <li key={item.fiturCode || item.path}>
                <NavLink
                  to={linkTo}
                  className={`flex items-center h-12 justify-center px-3 rounded-lg mx-2 transition-colors duration-200 ${
                    isActive
                      ? 'bg-primary-50 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400 font-semibold'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 hover:text-primary-600 dark:hover:text-primary-400'
                  }`}
                  title={item.label}
                >
                  <span
                    className={`inline-flex items-center justify-center h-12 w-12 ${
                      isActive ? 'text-primary-500 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500'
                    }`}
                  >
                    {item.icon}
                  </span>
                </NavLink>
                {shouldShowDivider && (
                  <div className="mx-2 my-2 border-t border-gray-200 dark:border-gray-700" aria-hidden="true" />
                )}
              </li>
            )
          })
        ) : filteredNavGroups.length === 0 ? (
          <li className="px-4 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
            Tidak ada menu yang cocok.
          </li>
        ) : (
          /* Sidebar expanded: accordion per grup dengan judul */
          filteredNavGroups.map((group) => {
            const open = isGroupOpenForDisplay(group.groupIndex)
            return (
              <li key={group.groupIndex} className="mb-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.groupIndex)}
                  className="flex items-center w-full h-9 px-3 rounded-lg mx-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <motion.span
                    animate={{ rotate: open ? 0 : -90 }}
                    className="shrink-0 mr-2 text-gray-400"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </motion.span>
                  <span className="truncate">{group.label}</span>
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      {group.items.map((entry) => {
                        const { item } = entry
                        const isActive = isActivePath(item.path)
                        const kids = item.children || []
                        const submenuKey = item.fiturCode || item.path
                        const submenuOpen =
                          kids.length > 0 &&
                          (menuSearchQuery.trim() || openSubmenus.has(submenuKey))
                        const childActive = kids.some((ch) => isActivePath(ch.path))
                        const pathsWithNis = ['/pendaftaran', '/uwaba', '/tunggakan', '/khusus']
                        const shouldIncludeNis =
                          pathsWithNis.includes(item.path) && idFromUrl && /^\d{7}$/.test(idFromUrl)
                        const linkTo = shouldIncludeNis ? `${item.path}?nis=${idFromUrl}` : item.path
                        return (
                          <div key={item.fiturCode || item.path}>
                            <div className="flex items-center mx-2">
                              <NavLink
                                to={linkTo}
                                className={`flex items-center h-12 space-x-3 px-3 pl-6 rounded-lg flex-1 min-w-0 transition-colors duration-200 ${
                                  isActive || childActive
                                    ? 'bg-primary-50 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400 font-semibold'
                                    : 'text-gray-500 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 hover:text-primary-600 dark:hover:text-primary-400'
                                }`}
                              >
                                <span
                                  className={`inline-flex items-center justify-center h-12 w-12 shrink-0 ${
                                    isActive || childActive
                                      ? 'text-primary-500 dark:text-primary-400'
                                      : 'text-gray-400 dark:text-gray-500'
                                  }`}
                                >
                                  {item.icon}
                                </span>
                                <motion.span
                                  initial={{ opacity: 0, width: 0 }}
                                  animate={{ opacity: 1, width: 'auto' }}
                                  exit={{ opacity: 0, width: 0 }}
                                  className="text-sm font-medium whitespace-nowrap overflow-hidden"
                                >
                                  {item.label}
                                </motion.span>
                              </NavLink>
                              {kids.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => toggleSubmenu(submenuKey)}
                                  className="shrink-0 w-8 h-8 mr-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 flex items-center justify-center"
                                  aria-label={submenuOpen ? 'Tutup submenu' : 'Buka submenu'}
                                  aria-expanded={submenuOpen}
                                >
                                  <motion.span animate={{ rotate: submenuOpen ? 0 : -90 }} className="flex">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </motion.span>
                                </button>
                              )}
                            </div>
                            {kids.length > 0 && (
                              <AnimatePresence initial={false}>
                                {submenuOpen && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.15 }}
                                    className="overflow-hidden"
                                  >
                                    {kids.map((ch) => {
                                      const chActive = isActivePath(ch.path)
                                      return (
                                        <NavLink
                                          key={ch.fiturCode || ch.path}
                                          to={ch.path}
                                          className={`flex items-center h-10 space-x-2 px-3 pl-12 rounded-lg mx-2 transition-colors duration-200 ${
                                            chActive
                                              ? 'bg-primary-50 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400 font-semibold'
                                              : 'text-gray-500 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 hover:text-primary-600 dark:hover:text-primary-400'
                                          }`}
                                        >
                                          <span
                                            className={`inline-flex items-center justify-center h-8 w-8 shrink-0 ${
                                              chActive
                                                ? 'text-primary-500 dark:text-primary-400'
                                                : 'text-gray-400 dark:text-gray-500'
                                            }`}
                                          >
                                            {ch.icon}
                                          </span>
                                          <span className="text-sm font-medium whitespace-nowrap overflow-hidden">
                                            {ch.label}
                                          </span>
                                        </NavLink>
                                      )
                                    })}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            )}
                          </div>
                        )
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            )
          })
        )}
      </ul>

      {/* Toggle Button */}
      <div className="p-2 border-t dark:border-gray-700 flex-shrink-0">
        <button
          onClick={toggleCollapsed}
          className="w-full flex items-center justify-center p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none transition-colors"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <motion.svg
            animate={{ rotate: isCollapsed ? 180 : 0 }}
            className="w-6 h-6 transition-transform duration-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </motion.svg>
        </button>
      </div>
    </motion.aside>
  )
}

export default Sidebar

