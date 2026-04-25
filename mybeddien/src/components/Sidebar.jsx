import { useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import { getGambarUrl } from '../config/images'
import { getSidebarGroups } from '../navigation/sidebarNav'

function HomeIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}

function BiodataIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

function RiwayatPembayaranIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  )
}

function ProfilIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )
}

function TokoIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  )
}

function BarangIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  )
}

function WaliIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  )
}

function PjgtIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  )
}

const ICONS = {
  '/': HomeIcon,
  '/profil': ProfilIcon,
  '/santri/biodata': BiodataIcon,
  '/santri/riwayat-pembayaran': RiwayatPembayaranIcon,
  '/wali-santri': WaliIcon,
  '/toko': TokoIcon,
  '/toko/barang': BarangIcon,
  '/pjgt': PjgtIcon,
}

function IconForPath({ path, className }) {
  const C = ICONS[path] || HomeIcon
  return <C className={className} />
}

function isPathActive(pathname, path) {
  if (path === '/') return pathname === '/'
  if (path === '/santri/riwayat-pembayaran') {
    return pathname === path || pathname.startsWith('/santri/riwayat-pembayaran/')
  }
  if (path === '/toko/barang') return pathname === path || pathname.startsWith('/toko/barang')
  if (path === '/toko') return pathname === '/toko' || (pathname.startsWith('/toko/') && !pathname.startsWith('/toko/barang'))
  return pathname === path || pathname.startsWith(`${path}/`)
}

export default function Sidebar() {
  const location = useLocation()
  const { user } = useAuthStore()
  const groups = useMemo(() => getSidebarGroups(user), [user])

  const [collapsedMap, setCollapsedMap] = useState({})
  const isGroupOpen = (id) => collapsedMap[id] !== true
  const toggleGroup = (id) => {
    setCollapsedMap((m) => ({ ...m, [id]: !m[id] }))
  }

  return (
    <aside className="hidden md:flex flex-col w-64 shrink-0 h-full min-h-0 bg-white dark:bg-gray-800 shadow-lg border-r border-gray-200/80 dark:border-gray-700/80 overflow-hidden">
      <div className="flex items-center justify-center h-20 shrink-0 shadow-md bg-primary-600 dark:bg-primary-800 overflow-hidden px-3">
        <motion.img
          initial={{ opacity: 0.85, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          src={getGambarUrl('/icon/mybeddientextputih.png')}
          alt="myBeddien"
          className="h-9 w-auto max-w-[200px] object-contain object-center drop-shadow-sm"
        />
      </div>

      <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden sidebar-scroll">
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
                        const active = isPathActive(location.pathname, item.path)
                        return (
                          <li key={item.path}>
                            <NavLink
                              to={item.path}
                              className={`flex items-center h-11 gap-3 px-3 rounded-lg mx-1 text-sm font-medium transition-colors duration-200 ${
                                active
                                  ? 'bg-primary-50 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400 font-semibold shadow-sm'
                                  : 'text-gray-500 dark:text-gray-400 hover:bg-primary-50/80 dark:hover:bg-primary-900/25 hover:text-primary-600 dark:hover:text-primary-400'
                              }`}
                            >
                              <span
                                className={`inline-flex items-center justify-center w-9 h-9 shrink-0 rounded-lg ${
                                  active ? 'text-primary-600 dark:text-primary-400 bg-white/90 dark:bg-gray-800/80' : 'text-gray-400 dark:text-gray-500'
                                }`}
                              >
                                <IconForPath path={item.path} className="w-5 h-5" />
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
      </nav>
    </aside>
  )
}
