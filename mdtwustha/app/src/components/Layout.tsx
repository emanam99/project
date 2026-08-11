import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation, useOutlet } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '../contexts/ThemeContext'
import { gambarUrl } from '../config/paths'
import { usePwaInstallPrompt } from '../hooks/usePwaInstallPrompt'
import MaterialIcon from './MaterialIcon'
import { clearSession, getStoredUser } from '../utils/auth'
import { RouteFade } from './AnimatedPanel'

function routeAnimKey(pathname: string) {
  if (pathname.startsWith('/pembayaran')) return '/pembayaran'
  if (pathname.startsWith('/absensi')) return pathname // rekap vs absensi berbeda
  if (pathname.startsWith('/nilai')) return pathname
  if (pathname.startsWith('/absen-guru')) return pathname
  return pathname
}

type NavItem = { to: string; label: string; icon: string; shortLabel?: string }

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', shortLabel: 'Home' },
  { to: '/data-santri', label: 'Data Santri', icon: 'groups', shortLabel: 'Santri' },
  { to: '/absensi', label: 'Absensi', icon: 'fact_check', shortLabel: 'Absensi' },
  { to: '/nilai', label: 'Nilai', icon: 'edit_note', shortLabel: 'Nilai' },
  { to: '/jadwal', label: 'Jadwal', icon: 'schedule', shortLabel: 'Jadwal' },
  { to: '/kalender', label: 'Kalender', icon: 'calendar_month', shortLabel: 'Kalender' },
  { to: '/absen-guru', label: 'Absen Guru', icon: 'school', shortLabel: 'Guru' },
]

const BOTTOM_NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Home', icon: 'dashboard' },
  { to: '/data-santri', label: 'Santri', icon: 'groups' },
  { to: '/absensi', label: 'Absensi', icon: 'fact_check' },
  { to: '/nilai', label: 'Nilai', icon: 'edit_note' },
]

const MORE_MENU_ITEMS: NavItem[] = [
  { to: '/jadwal', label: 'Jadwal', icon: 'schedule' },
  { to: '/kalender', label: 'Kalender', icon: 'calendar_month' },
  { to: '/absen-guru', label: 'Absen Guru', icon: 'school' },
]

const ADMIN_NAV_ITEMS: NavItem[] = [
  { to: '/pembayaran', label: 'Syahriah', icon: 'payments', shortLabel: 'Bayar' },
  { to: '/tahun-ajaran', label: 'Tahun Ajaran', icon: 'calendar_month', shortLabel: 'TA' },
  { to: '/kelas', label: 'Kelas', icon: 'apartment', shortLabel: 'Kelas' },
  { to: '/mapel', label: 'Mapel', icon: 'menu_book', shortLabel: 'Mapel' },
  { to: '/pengurus', label: 'Pengurus', icon: 'admin_panel_settings', shortLabel: 'Admin' },
]

const STORAGE_KEY = 'mdtwustha_sidebar_collapsed'

const menuBackdropMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.22, ease: 'easeOut' },
}

const menuPanelMotion = {
  initial: { opacity: 0, y: 16, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 12, scale: 0.97 },
  transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
}

const profilePanelMotion = {
  initial: { opacity: 0, y: -8, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -6, scale: 0.96 },
  transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
}

function sidebarLinkClass(isActive: boolean, collapsed: boolean) {
  return `flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} py-2.5 rounded-lg text-sm font-medium transition ${
    isActive
      ? 'bg-blue-500/20 text-blue-600 dark:text-blue-300 border border-blue-500/30'
      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 border border-transparent'
  }`
}

function bottomLinkClass(isActive: boolean) {
  return `flex flex-col items-center justify-center gap-0.5 w-full px-1 py-2 text-center transition ${
    isActive
      ? 'text-blue-600 dark:text-blue-400'
      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
  }`
}

function moreMenuLinkClass(isActive: boolean) {
  return `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
    isActive
      ? 'bg-blue-500/20 text-blue-600 dark:text-blue-300 border border-blue-500/30'
      : 'text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 border border-transparent'
  }`
}

function getInitial(name: string, nip: string) {
  const source = name.trim() || nip.trim()
  return source ? source.charAt(0).toUpperCase() : '?'
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <motion.span
      key={open ? 'close' : 'menu'}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.18 }}
      className="flex items-center justify-center"
      aria-hidden
    >
      <MaterialIcon name={open ? 'close' : 'menu'} size={22} />
    </motion.span>
  )
}

function ProfileAvatar({ name, nip, size = 'sm' }: { name: string; nip: string; size?: 'sm' | 'lg' }) {
  const initial = getInitial(name, nip)
  const sizeClass = size === 'lg' ? 'w-14 h-14 text-xl' : 'w-9 h-9 text-sm'

  return (
    <span
      className={`${sizeClass} rounded-full bg-gradient-to-br from-blue-500 to-violet-600 text-white font-semibold flex items-center justify-center shadow-md ring-2 ring-white/20 dark:ring-white/10 flex-shrink-0`}
      aria-hidden
    >
      {initial}
    </span>
  )
}

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const outlet = useOutlet()
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const { theme, toggleTheme } = useTheme()
  const { canInstall, promptInstall } = usePwaInstallPrompt()
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0')
    } catch (_) {}
  }, [collapsed])

  useEffect(() => {
    setMenuOpen(false)
    setProfileOpen(false)
  }, [location.pathname])

  // Landscape HP: tutup menu bawah mengambang (nav beralih ke sidebar)
  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)')
    const onChange = () => {
      if (mq.matches) setMenuOpen(false)
    }
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const handleLogout = () => {
    setProfileOpen(false)
    clearSession()
    navigate('/login', { replace: true })
  }

  const user = getStoredUser()
  const userName = user?.name || ''
  const userNip = user?.nip || ''
  const userAkses = user?.akses || 'user'

  const displayName = userName || userNip || 'Pengurus'
  const isAdmin = userAkses === 'super_admin' || userAkses === 'admin'
  const moreMenuItems = isAdmin ? [...MORE_MENU_ITEMS, ...ADMIN_NAV_ITEMS] : MORE_MENU_ITEMS
  const moreMenuPaths = moreMenuItems.map((item) => item.to)
  const isMoreMenuActive = moreMenuPaths.includes(location.pathname)

  return (
    <div className="h-dvh max-h-dvh overflow-hidden bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex">
      {/* Sidebar — desktop + landscape (HP diputar); tinggi tetap, tidak ikut scroll halaman */}
      <aside
        className={`hidden landscape:flex lg:flex flex-shrink-0 h-full self-stretch border-r border-slate-200 dark:border-white/10 bg-white/80 dark:bg-slate-900/80 backdrop-blur flex-col transition-[width] duration-300 ease-in-out ${
          collapsed ? 'w-[4.5rem]' : 'w-64'
        }`}
      >
        <div
          className={`border-b border-slate-200 dark:border-white/10 flex items-center ${
            collapsed ? 'flex-col gap-2 py-3 px-2' : 'justify-between p-4'
          }`}
        >
          {collapsed ? (
            <img
              src={gambarUrl('logo/icon.png')}
              alt="MDT Wustha"
              title="MDT Wustha"
              className="w-9 h-9 rounded-lg object-contain"
            />
          ) : (
            <div className="min-w-0 flex items-center gap-2.5">
              <img
                src={gambarUrl('logo/icon.png')}
                alt=""
                className="w-9 h-9 rounded-lg object-contain flex-shrink-0"
              />
              <div className="min-w-0">
                <h2 className="text-slate-800 dark:text-slate-100 font-bold text-base tracking-tight truncate">
                  MDT Wustha
                </h2>
                <p className="text-slate-500 text-xs mt-0.5">Menu Utama</p>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Perluas sidebar' : 'Kecilkan sidebar'}
            title={collapsed ? 'Perluas sidebar' : 'Kecilkan sidebar'}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/10 rounded-lg hover:text-slate-800 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 transition"
          >
            {collapsed ? <MaterialIcon name="chevron_right" size={20} /> : <MaterialIcon name="chevron_left" size={20} />}
          </button>
        </div>

        <nav className="flex-1 py-3 px-2 overflow-y-auto overflow-x-hidden">
          <ul className="space-y-0.5 list-none m-0 p-0">
            {NAV_ITEMS.map(({ to, label, icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  title={collapsed ? label : undefined}
                  className={({ isActive }) => sidebarLinkClass(isActive, collapsed)}
                  end={to === '/dashboard'}
                >
                  <MaterialIcon name={icon} size={22} />
                  {!collapsed && <span className="truncate">{label}</span>}
                </NavLink>
              </li>
            ))}
            {isAdmin &&
              ADMIN_NAV_ITEMS.map(({ to, label, icon }, index) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    title={collapsed ? label : undefined}
                    className={({ isActive }) =>
                      `${sidebarLinkClass(isActive, collapsed)} ${collapsed || index > 0 ? '' : 'mt-4'} ${
                        isActive
                          ? '!bg-purple-500/20 !text-purple-600 dark:!text-purple-300 !border-purple-500/30'
                          : ''
                      }`
                    }
                  >
                    <MaterialIcon name={icon} size={22} />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </NavLink>
                </li>
              ))}
          </ul>
        </nav>
      </aside>

      {/* Area kanan: Header + konten (hanya main yang scroll) */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <header className="relative flex-shrink-0 h-14 flex items-center justify-between gap-4 px-4 sm:px-6 border-b border-slate-200 dark:border-white/10 bg-white/70 dark:bg-slate-900/60 backdrop-blur z-40">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src={gambarUrl('logo/icon.png')}
              alt=""
              className="w-8 h-8 rounded-lg object-contain flex-shrink-0 landscape:hidden lg:hidden"
            />
            <span className="text-slate-800 dark:text-slate-100 font-semibold text-sm landscape:hidden lg:hidden truncate">
              MDT Wustha
            </span>
            <span className="text-slate-500 text-sm hidden landscape:inline lg:inline">MDT Wustha</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canInstall && (
              <button
                type="button"
                onClick={() => void promptInstall()}
                className="inline-flex h-9 w-9 sm:w-auto items-center justify-center gap-1.5 px-0 sm:px-2.5 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300 text-xs font-semibold hover:bg-blue-500/20 transition"
                title="Install aplikasi MDT Wustha"
                aria-label="Install aplikasi"
              >
                <MaterialIcon name="download" size={18} />
                <span className="hidden sm:inline">Install</span>
              </button>
            )}

            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen((open) => !open)}
                aria-expanded={profileOpen}
                aria-haspopup="menu"
                aria-label="Profil pengguna"
                className={`rounded-full transition-transform duration-200 ${
                  profileOpen ? 'scale-95 ring-2 ring-blue-500/40' : 'hover:scale-105'
                }`}
              >
                <ProfileAvatar name={displayName} nip={userNip} />
              </button>

              <AnimatePresence>
                {profileOpen && (
                  <>
                    <motion.button
                      type="button"
                      className="fixed inset-0 z-[80]"
                      aria-label="Tutup profil"
                      onClick={() => setProfileOpen(false)}
                      {...menuBackdropMotion}
                    />
                    <motion.div
                      className="absolute right-0 top-[calc(100%+0.5rem)] z-[90] w-72 rounded-2xl border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md shadow-2xl overflow-hidden"
                      role="menu"
                      aria-label="Menu profil"
                      {...profilePanelMotion}
                    >
                      <div className="px-5 pt-5 pb-4 flex flex-col items-center text-center">
                        <ProfileAvatar name={displayName} nip={userNip} size="lg" />
                        <p className="mt-3 text-base font-semibold text-slate-800 dark:text-slate-100 truncate w-full">
                          {displayName}
                        </p>
                        {userNip && (
                          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">NIP: {userNip}</p>
                        )}
                      </div>

                      <div className="h-px bg-slate-200 dark:bg-white/10 mx-4" />

                      <div className="p-3 space-y-1">
                        <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Tema</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {theme === 'dark' ? 'Mode gelap' : 'Mode terang'}
                            </p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={theme === 'dark'}
                            onClick={toggleTheme}
                            className={`relative w-12 h-7 rounded-full transition-colors duration-300 ${
                              theme === 'dark' ? 'bg-blue-600' : 'bg-slate-300'
                            }`}
                          >
                            <motion.span
                              className="absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow flex items-center justify-center text-[10px]"
                              animate={{ x: theme === 'dark' ? 20 : 0 }}
                              transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                            >
                            <MaterialIcon name={theme === 'dark' ? 'dark_mode' : 'light_mode'} size={14} />
                          </motion.span>
                          </button>
                        </div>

                        <button
                          type="button"
                          role="menuitem"
                          onClick={handleLogout}
                          className="w-full px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 transition text-left"
                        >
                          Keluar
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <main
          className={`flex-1 min-h-0 overflow-x-hidden px-4 sm:px-6 lg:px-8 pb-[5.5rem] landscape:pb-6 lg:pb-6 ${
            location.pathname.startsWith('/pembayaran')
              ? 'overflow-hidden py-3 sm:py-4'
              : 'overflow-y-auto py-6'
          }`}
        >
          <RouteFade
            routeKey={routeAnimKey(location.pathname)}
            className={location.pathname.startsWith('/pembayaran') ? 'h-full min-h-0' : undefined}
          >
            {outlet}
          </RouteFade>
        </main>
      </div>

      {/* Menu mengambang — hanya portrait + di bawah lg */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.button
              type="button"
              className="landscape:hidden lg:hidden fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px]"
              aria-label="Tutup menu"
              onClick={() => setMenuOpen(false)}
              {...menuBackdropMotion}
            />
            <motion.div
              className="landscape:hidden lg:hidden fixed left-4 right-4 z-[70] rounded-2xl border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md shadow-2xl p-2"
              style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))' }}
              role="menu"
              aria-label="Menu lainnya"
              {...menuPanelMotion}
            >
              <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Menu lainnya
              </p>
              <ul className="m-0 p-0 list-none space-y-0.5">
                {moreMenuItems.map(({ to, label, icon }, index) => (
                  <motion.li
                    key={to}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.04 + index * 0.04, duration: 0.22, ease: 'easeOut' }}
                  >
                    <NavLink
                      to={to}
                      role="menuitem"
                      className={({ isActive }) => moreMenuLinkClass(isActive)}
                      onClick={() => setMenuOpen(false)}
                    >
                      <MaterialIcon name={icon} size={20} />
                      {label}
                    </NavLink>
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Nav bawah — hanya portrait mobile/tablet */}
      <nav
        className="landscape:hidden lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        aria-label="Navigasi utama"
      >
        <ul className="flex items-stretch justify-center w-full m-0 p-0 list-none">
          {BOTTOM_NAV_ITEMS.slice(0, 2).map(({ to, label, icon }) => (
            <li key={to} className="flex-1 min-w-0 flex justify-center">
              <NavLink
                to={to}
                className={({ isActive }) => bottomLinkClass(isActive)}
                end={to === '/dashboard'}
              >
                <MaterialIcon name={icon} size={22} />
                <span className="text-[10px] font-medium leading-tight w-full truncate">{label}</span>
              </NavLink>
            </li>
          ))}

          <li className="flex-1 min-w-0 flex justify-center">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className={bottomLinkClass(menuOpen || isMoreMenuActive)}
            >
              <MenuIcon open={menuOpen} />
              <span className="text-[10px] font-medium leading-tight w-full truncate mt-0.5">Menu</span>
            </button>
          </li>

          {BOTTOM_NAV_ITEMS.slice(2).map(({ to, label, icon }) => (
            <li key={to} className="flex-1 min-w-0 flex justify-center">
              <NavLink
                to={to}
                className={({ isActive }) => bottomLinkClass(isActive)}
              >
                <MaterialIcon name={icon} size={22} />
                <span className="text-[10px] font-medium leading-tight w-full truncate">{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
