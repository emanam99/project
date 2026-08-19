import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { NavLink, useLocation } from 'react-router-dom'
import { PageTitleProvider, usePageTitleContext } from '../contexts/PageTitleContext'
import { useBottomNavSwipe } from '../hooks/useBottomNavSwipe'
import { getStoredUser, isSuperAdminRole } from '../utils/auth'
import { gambarUrl } from '../utils/gambar'
import { AnimatedOutlet } from './PageTransition'
import ProfileMenu from './ProfileMenu'
import PwaInstallButton from './PwaInstallButton'

const SIDEBAR_KEY = 'sppg_sidebar_collapsed'
const HEADER_HIDE_AFTER = 48
const HEADER_SHOW_DELTA = 4
const BOTTOM_NAV_MAX = 5

type NavIcon = 'home' | 'cart' | 'bowl' | 'bank' | 'users' | 'settings' | 'archive' | 'more'

type NavItem = {
  to: string
  label: string
  shortLabel: string
  icon: NavIcon
}

function Icon({ name, className = 'h-4 w-4' }: { name: NavIcon; className?: string }) {
  const common = {
    className,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    viewBox: '0 0 24 24',
    'aria-hidden': true,
  }

  switch (name) {
    case 'home':
      return (
        <svg {...common}>
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z" />
        </svg>
      )
    case 'cart':
      return (
        <svg {...common}>
          <circle cx="9" cy="20" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="17" cy="20" r="1.2" fill="currentColor" stroke="none" />
          <path d="M3 4h2l2.2 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2L20 8H7" />
        </svg>
      )
    case 'bowl':
      return (
        <svg {...common}>
          <path d="M4 11c0 4.4 3.6 8 8 8s8-3.6 8-8" />
          <path d="M3 11h18" />
          <path d="M8 7.5c.8-1.2 1.9-2 4-2s3.2.8 4 2" />
        </svg>
      )
    case 'bank':
      return (
        <svg {...common}>
          <path d="M3 10 12 4l9 6" />
          <path d="M5 10v8" />
          <path d="M9.5 10v8" />
          <path d="M14.5 10v8" />
          <path d="M19 10v8" />
          <path d="M3 18h18" />
        </svg>
      )
    case 'users':
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
          <circle cx="9.5" cy="7.5" r="3.5" />
          <path d="M20 21v-2a3.5 3.5 0 0 0-2.5-3.35" />
          <path d="M16.5 4.1a3.5 3.5 0 0 1 0 6.8" />
        </svg>
      )
    case 'archive':
      return (
        <svg {...common}>
          <path d="M4 7h16v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7z" />
          <path d="M3 5h18v2H3z" />
          <path d="M10 12h4" />
        </svg>
      )
    case 'more':
      return (
        <svg {...common}>
          <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      )
  }
}

function sidebarLinkClass(isActive: boolean, collapsed: boolean) {
  return [
    'flex items-center rounded-lg text-[13px] font-semibold transition',
    collapsed ? 'justify-center px-1.5 py-2' : 'gap-2.5 px-2.5 py-2',
    isActive
      ? 'bg-[var(--accent)] text-white shadow-sm'
      : 'text-ink hover:bg-surface-soft',
  ].join(' ')
}

function bottomLinkClass(isActive: boolean) {
  return [
    'bottom-nav-link relative flex flex-1 flex-col items-center justify-center gap-1 min-w-0 pt-2.5 pb-1.5 text-[10px] font-semibold tracking-wide transition-colors duration-200',
    isActive ? 'text-[var(--accent)]' : 'text-muted hover:text-ink active:text-ink',
  ].join(' ')
}

function splitBottomNav(items: NavItem[]): { slots: Array<NavItem | 'more'>; overflow: NavItem[] } {
  if (items.length <= BOTTOM_NAV_MAX) {
    return { slots: items, overflow: [] }
  }
  const left = items.slice(0, 2)
  const right = items.slice(-2)
  const overflow = items.slice(2, -2)
  return { slots: [...left, 'more', ...right], overflow }
}

export default function Layout() {
  return (
    <PageTitleProvider>
      <LayoutShell />
    </PageTitleProvider>
  )
}

function LayoutShell() {
  const user = getStoredUser()
  const superAdmin = isSuperAdminRole(user?.role)
  const { title } = usePageTitleContext()
  const reduce = useReducedMotion()
  const location = useLocation()

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1'
    } catch {
      return false
    }
  })
  const [headerVisible, setHeaderVisible] = useState(true)
  const [moreOpen, setMoreOpen] = useState(false)
  const lastScrollY = useRef(0)

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [collapsed])

  useEffect(() => {
    setMoreOpen(false)
  }, [location.pathname])

  useEffect(() => {
    lastScrollY.current = window.scrollY || 0

    const onScroll = () => {
      const y = window.scrollY || 0
      const delta = y - lastScrollY.current

      if (y <= HEADER_HIDE_AFTER) {
        setHeaderVisible(true)
      } else if (delta < -HEADER_SHOW_DELTA) {
        setHeaderVisible(true)
      } else if (delta > 6) {
        setHeaderVisible(false)
      }

      lastScrollY.current = y
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const navItems: NavItem[] = useMemo(
    () => [
      { to: '/dashboard', label: 'Beranda', shortLabel: 'Home', icon: 'home' },
      { to: '/belanja', label: 'Belanja', shortLabel: 'Belanja', icon: 'cart' },
      { to: '/porsi', label: 'Porsi', shortLabel: 'Porsi', icon: 'bowl' },
      { to: '/rekening', label: 'Rekening', shortLabel: 'Rek', icon: 'bank' },
      ...(superAdmin
        ? ([
            { to: '/arsip-ekspor', label: 'Arsip Ekspor', shortLabel: 'Arsip', icon: 'archive' },
            { to: '/pengguna', label: 'Pengguna', shortLabel: 'User', icon: 'users' },
          ] as NavItem[])
        : []),
      { to: '/pengaturan', label: 'Pengaturan', shortLabel: 'Atur', icon: 'settings' },
    ],
    [superAdmin],
  )

  const { slots: bottomSlots, overflow: overflowItems } = useMemo(
    () => splitBottomNav(navItems),
    [navItems],
  )

  const moreActive = overflowItems.some(
    (item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`),
  )

  const navPaths = useMemo(() => navItems.map((item) => item.to), [navItems])
  useBottomNavSwipe(navPaths)

  useEffect(() => {
    if (!moreOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moreOpen])

  return (
    <div className="min-h-screen md:flex bg-canvas">
      <aside
        className={[
          'hidden md:flex md:flex-col md:sticky md:top-0 md:h-screen border-r border-line bg-surface/95 backdrop-blur-xl transition-[width] duration-200',
          collapsed ? 'md:w-14' : 'md:w-52',
        ].join(' ')}
      >
        <div className={`flex items-center gap-2.5 border-b border-line ${collapsed ? 'justify-center p-2' : 'p-2.5'}`}>
          <img
            src={gambarUrl('icon/sppg.v3.u.png')}
            alt="SPPG"
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-lg object-contain select-none"
            draggable={false}
          />
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-display text-[15px] font-bold text-ink leading-tight">SPPG</div>
              <div className="text-[11px] text-muted truncate">{user?.name || user?.email}</div>
            </div>
          )}
        </div>

        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) => sidebarLinkClass(isActive, collapsed)}
            >
              <Icon name={item.icon} />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="p-2 border-t border-line">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className={sidebarLinkClass(false, collapsed) + ' w-full'}
            title={collapsed ? 'Perluas menu' : 'Ciutkan menu'}
            aria-label={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
          >
            <svg
              className={`h-4 w-4 transition-transform ${collapsed ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden
            >
              <path d="M15 6 9 12l6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {!collapsed && <span>Ciutkan</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-screen overflow-x-hidden">
        <header
          className={[
            'sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur-xl transition-transform duration-200 ease-out will-change-transform',
            headerVisible ? 'translate-y-0' : '-translate-y-full pointer-events-none',
          ].join(' ')}
        >
          <div className="px-3.5 py-2.5 flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="md:hidden h-8 w-8 rounded-lg bg-[var(--accent)] text-white grid place-items-center font-display text-xs font-bold shrink-0">
                SP
              </div>
              <div className="min-w-0 [perspective:640px]">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.h1
                    key={title}
                    className="font-display text-[15px] font-bold text-ink leading-tight truncate"
                    initial={
                      reduce
                        ? { opacity: 0 }
                        : { opacity: 0, rotateX: 78, y: 4 }
                    }
                    animate={{ opacity: 1, rotateX: 0, y: 0 }}
                    exit={
                      reduce
                        ? { opacity: 0 }
                        : { opacity: 0, rotateX: -78, y: -4 }
                    }
                    transition={{ duration: reduce ? 0.12 : 0.32, ease: [0.22, 1, 0.36, 1] }}
                    style={{ transformOrigin: '50% 50%', transformStyle: 'preserve-3d' }}
                  >
                    {title}
                  </motion.h1>
                </AnimatePresence>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <PwaInstallButton compact className="sm:hidden" />
              <PwaInstallButton className="hidden sm:inline-flex" />
              <ProfileMenu user={user} />
            </div>
          </div>
        </header>

        <main className="flex-1 w-full max-w-5xl mx-auto px-3 py-3.5 pb-[5.25rem] md:pb-4 md:py-4 min-w-0 overflow-x-hidden">
          <AnimatedOutlet />
        </main>
      </div>

      <nav
        className="bottom-nav md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-line bg-surface/92 backdrop-blur-xl safe-bottom"
        aria-label="Navigasi utama"
      >
        <div className="flex items-stretch max-w-lg mx-auto px-1.5">
          {bottomSlots.map((slot) => {
            if (slot === 'more') {
              return (
                <button
                  key="more"
                  type="button"
                  className={bottomLinkClass(moreActive || moreOpen)}
                  onClick={() => setMoreOpen((v) => !v)}
                  aria-expanded={moreOpen}
                  aria-label="Menu lainnya"
                >
                  <span
                    className={[
                      'pointer-events-none absolute top-0 left-1/2 h-[2.5px] w-5 -translate-x-1/2 rounded-full bg-[var(--accent)] transition-all duration-200 ease-out',
                      moreActive || moreOpen ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-50',
                    ].join(' ')}
                    aria-hidden
                  />
                  <span
                    className={[
                      'bottom-nav-icon grid place-items-center h-9 w-9 rounded-2xl transition-all duration-200 ease-out',
                      moreActive || moreOpen
                        ? 'bottom-nav-icon-active text-[var(--accent)] scale-105'
                        : 'text-muted scale-100',
                    ].join(' ')}
                  >
                    <Icon name="more" className="h-[1.15rem] w-[1.15rem]" />
                  </span>
                  <span className="leading-none truncate max-w-full px-0.5">Menu</span>
                </button>
              )
            }

            const item = slot
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => bottomLinkClass(isActive)}
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={[
                        'pointer-events-none absolute top-0 left-1/2 h-[2.5px] w-5 -translate-x-1/2 rounded-full bg-[var(--accent)] transition-all duration-200 ease-out',
                        isActive ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-50',
                      ].join(' ')}
                      aria-hidden
                    />
                    <span
                      className={[
                        'bottom-nav-icon grid place-items-center h-9 w-9 rounded-2xl transition-all duration-200 ease-out',
                        isActive
                          ? 'bottom-nav-icon-active text-[var(--accent)] scale-105'
                          : 'text-muted scale-100',
                      ].join(' ')}
                    >
                      <Icon name={item.icon} className="h-[1.15rem] w-[1.15rem]" />
                    </span>
                    <span
                      className={[
                        'leading-none truncate max-w-full px-0.5 transition-opacity duration-200',
                        isActive ? 'opacity-100' : 'opacity-80',
                      ].join(' ')}
                    >
                      {item.shortLabel}
                    </span>
                  </>
                )}
              </NavLink>
            )
          })}
        </div>
      </nav>

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {moreOpen && (
              <>
                <motion.button
                  type="button"
                  aria-label="Tutup menu"
                  className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setMoreOpen(false)}
                />
                <motion.div
                  className="md:hidden fixed inset-x-0 bottom-0 z-50 safe-bottom rounded-t-2xl border border-line bg-surface shadow-xl"
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', stiffness: 380, damping: 36 }}
                  role="dialog"
                  aria-modal="true"
                  aria-label="Menu lainnya"
                >
                  <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-line">
                    <div className="font-semibold text-ink text-[14px]">Menu lainnya</div>
                    <button
                      type="button"
                      className="ui-btn-ghost h-9 w-9 !p-0"
                      onClick={() => setMoreOpen(false)}
                      aria-label="Tutup"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="p-2 pb-4 grid gap-1">
                    {overflowItems.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setMoreOpen(false)}
                        className={({ isActive }) =>
                          [
                            'flex items-center gap-3 rounded-xl px-3 py-3 text-[14px] font-semibold transition',
                            isActive
                              ? 'bg-[var(--accent)] text-white'
                              : 'text-ink hover:bg-surface-soft',
                          ].join(' ')
                        }
                      >
                        <Icon name={item.icon} className="h-5 w-5" />
                        <span>{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  )
}
