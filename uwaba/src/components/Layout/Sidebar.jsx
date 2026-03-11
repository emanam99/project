import { NavLink, useLocation, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useSidebarStore } from '../../store/sidebarStore'
import { getGambarUrl } from '../../config/images'
import { getMenuItemsWithSeparators, GROUP_ORDER } from '../../config/menuConfig'
import { getIcon } from '../../config/menuIcons'

const GROUP_LABELS = GROUP_ORDER
const navItems = getMenuItemsWithSeparators().map((item) => ({
  path: item.path,
  label: item.label,
  icon: getIcon(item.iconKey, 'w-6 h-6'),
  showSeparatorAfter: item.showSeparatorAfter,
  requiresRole: item.requiresRole,
  requiresSuperAdmin: item.requiresSuperAdmin,
  requiresPermission: item.requiresPermission
}))


function Sidebar() {
  const { isCollapsed, toggleCollapsed } = useSidebarStore()
  const [isScrolling, setIsScrolling] = useState(false)
  const scrollTimeoutRef = useRef(null)
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { user, viewAsRole, getEffectiveRole, isRealSuperAdmin } = useAuthStore()
  const effectiveRole = getEffectiveRole?.() ?? (user?.role_key || user?.level || '').toLowerCase()
  const realSuperAdmin = isRealSuperAdmin?.() ?? (user && (user?.role_key || user?.level || '').toLowerCase() === 'super_admin')
  
  // Ambil NIS/ID dari URL (pembayaran pakai nis, pendaftaran pakai id; bawa keduanya agar data santri tetap)
  const idFromUrl = searchParams.get('nis') || searchParams.get('id')
  
  
  // Helper untuk cek permission
  const hasPermission = (permission) => {
    if (!user || !user.permissions) {
      return false
    }
    return user.permissions.includes(permission)
  }
  
  // Helper untuk cek role - pakai effectiveRole (super_admin + viewAsRole => role yang dicoba)
  const hasRole = (roles) => {
    if (!user || !roles || !Array.isArray(roles)) {
      return false
    }
    const allowed = roles.map(r => r.toLowerCase())
    return allowed.includes(effectiveRole)
  }
  
  // Indeks grup per item (berdasarkan urutan asli navItems); pembatas selalu antara beda grup
  const groupIndices = useMemo(() => {
    const out = []
    let g = 0
    for (let i = 0; i < navItems.length; i++) {
      out[i] = g
      if (navItems[i].showSeparatorAfter) g++
    }
    return out
  }, [])

  // Filter nav items: pakai effectiveRole, kecuali Role & Akses selalu tampil untuk super_admin asli
  const filteredNavItems = useMemo(() => {
    const canSee = (item) => {
      // Halaman Role & Akses selalu tampil untuk super_admin asli (meski sedang "coba sebagai" role lain)
      if (item.path === '/settings/role-akses') {
        return realSuperAdmin
      }
      if (effectiveRole === 'super_admin') return true // Super Admin (tanpa viewAs) lihat semua menu
      const userLevel = user?.level?.toLowerCase()
      if (item.requiresRole) return hasRole(item.requiresRole)
      if (item.requiresSuperAdmin) return effectiveRole === 'super_admin'
      if (item.requiresAdmin) return user && (userLevel === 'admin' || effectiveRole === 'admin_uwaba' || effectiveRole === 'admin_psb' || effectiveRole === 'admin_lembaga' || effectiveRole === 'super_admin')
      if (item.requiresPermission) return user && hasPermission(item.requiresPermission)
      return true
    }
    return navItems
      .map((item, i) => ({ item, groupIndex: groupIndices[i] }))
      .filter(({ item }) => canSee(item))
  }, [user, groupIndices, effectiveRole, realSuperAdmin, viewAsRole])

  // Grup untuk accordion: { groupIndex, label, items }
  const navGroups = useMemo(() => {
    const byGroup = new Map()
    filteredNavItems.forEach((entry) => {
      const g = entry.groupIndex
      if (!byGroup.has(g)) byGroup.set(g, { groupIndex: g, label: GROUP_LABELS[g] ?? 'Menu', items: [] })
      byGroup.get(g).items.push(entry)
    })
    return Array.from(byGroup.values()).sort((a, b) => a.groupIndex - b.groupIndex)
  }, [filteredNavItems])

  const [openGroups, setOpenGroups] = useState(new Set())

  const toggleGroup = (groupIndex) => {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupIndex)) next.delete(groupIndex)
      else next.add(groupIndex)
      return next
    })
  }
  const isGroupOpen = (groupIndex) => openGroups.has(groupIndex)

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
    // Untuk pendaftaran/item: aktif juga di sub-halaman (Manage Set, Kondisi, Registrasi, Assign, Simulasi) — akses lewat Item
    if (path === '/pendaftaran/item') {
      const itemSubPaths = ['/pendaftaran/item', '/pendaftaran/manage-item-set', '/pendaftaran/manage-kondisi', '/pendaftaran/kondisi-registrasi', '/pendaftaran/assign-item', '/pendaftaran/simulasi']
      return itemSubPaths.some((p) => location.pathname === p || (p !== '/pendaftaran/item' && location.pathname.startsWith(p + '/')))
    }
    // Untuk pendaftaran/data-pendaftar, cek path yang tepat
    if (path === '/pendaftaran/data-pendaftar') {
      return location.pathname === '/pendaftaran/data-pendaftar'
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
      const itemAreaPaths = ['/pendaftaran/item', '/pendaftaran/manage-item-set', '/pendaftaran/manage-kondisi', '/pendaftaran/kondisi-registrasi', '/pendaftaran/assign-item', '/pendaftaran/simulasi']
      if (itemAreaPaths.some((p) => location.pathname === p || location.pathname.startsWith(p + '/'))) return false
      if (location.pathname === '/pendaftaran/data-pendaftar' || location.pathname === '/pendaftaran/padukan-data' || location.pathname === '/pendaftaran/pengaturan') return false
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
    // Kalender Pesantren
    if (path === '/kalender-pesantren') return location.pathname === '/kalender-pesantren'
    if (path === '/kalender-pesantren/pengaturan') return location.pathname === '/kalender-pesantren/pengaturan'
    if (path === '/kalender-pesantren/kelola-event') return location.pathname === '/kalender-pesantren/kelola-event'
    // Untuk juara, semua path juara dianggap aktif jika dimulai dengan /juara
    if (path === '/juara/data-juara') {
      return location.pathname.startsWith('/juara')
    }
    // UGT - Data Madrasah, Koordinator
    if (path === '/ugt/data-madrasah') return location.pathname === '/ugt/data-madrasah'
    if (path === '/koordinator') return location.pathname === '/koordinator'
    // Cashless - Data Toko, Top Up, Akun Cashless, Pengaturan
    if (path === '/cashless/data-toko') return location.pathname === '/cashless/data-toko'
    if (path === '/cashless/topup') return location.pathname === '/cashless/topup'
    // Grup My Workspace
    if (path === '/beranda') return location.pathname === '/beranda'
    if (path === '/profil') return location.pathname === '/profil' || location.pathname.startsWith('/profil/')
    // Exact match untuk semua path termasuk /uwaba, /tunggakan, /khusus
    return location.pathname === path
  }

  const sidebarWidth = isCollapsed ? 'w-20' : 'w-64'

  return (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 80 : 256 }}
      className={`hidden sm:flex flex-col bg-white dark:bg-gray-800 shadow-lg transition-all duration-300 ease-in-out ${sidebarWidth} overflow-hidden h-screen`}
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
              style={{ objectFit: 'cover' }}
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
          filteredNavItems.map((entry, index) => {
            const { item, groupIndex } = entry
            const isActive = isActivePath(item.path)
            const nextEntry = filteredNavItems[index + 1]
            const shouldShowDivider = nextEntry != null && nextEntry.groupIndex !== groupIndex
            const pathsWithNis = ['/pendaftaran', '/uwaba', '/tunggakan', '/khusus']
            const shouldIncludeNis = pathsWithNis.includes(item.path) && idFromUrl && /^\d{7}$/.test(idFromUrl)
            const linkTo = shouldIncludeNis ? `${item.path}?nis=${idFromUrl}` : item.path
            return (
              <li key={item.path}>
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
        ) : (
          /* Sidebar expanded: accordion per grup dengan judul */
          navGroups.map((group) => {
            const open = isGroupOpen(group.groupIndex)
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
                        const pathsWithNis = ['/pendaftaran', '/uwaba', '/tunggakan', '/khusus']
                        const shouldIncludeNis = pathsWithNis.includes(item.path) && idFromUrl && /^\d{7}$/.test(idFromUrl)
                        const linkTo = shouldIncludeNis ? `${item.path}?nis=${idFromUrl}` : item.path
                        return (
                          <NavLink
                            key={item.path}
                            to={linkTo}
                            className={`flex items-center h-12 space-x-3 px-3 pl-6 rounded-lg mx-2 transition-colors duration-200 ${
                              isActive
                                ? 'bg-primary-50 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400 font-semibold'
                                : 'text-gray-500 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 hover:text-primary-600 dark:hover:text-primary-400'
                            }`}
                          >
                            <span
                              className={`inline-flex items-center justify-center h-12 w-12 shrink-0 ${
                                isActive ? 'text-primary-500 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500'
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

