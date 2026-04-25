import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../store/authStore'

const navItemsSantri = [
  { path: '/', label: 'Beranda', icon: HomeIcon },
  { path: '/santri/biodata', label: 'Biodata', icon: BiodataIcon },
  { path: '/santri/riwayat-pembayaran', label: 'Pembayaran', icon: RiwayatPembayaranIcon },
  { path: '/profil', label: 'Profil', icon: ProfilIcon },
]

const navItemsToko = [
  { path: '/', label: 'Beranda', icon: HomeIcon },
  { path: '/toko', label: 'Toko', icon: TokoIcon },
  { path: '/toko/barang', label: 'Barang', icon: BarangIcon },
  { path: '/profil', label: 'Profil', icon: ProfilIcon },
]

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

function pathActive(pathname, path) {
  if (path === '/') return pathname === '/'
  if (path === '/santri/riwayat-pembayaran') return pathname === path || pathname.startsWith('/santri/riwayat-pembayaran/')
  if (path === '/toko/barang') return pathname === path || pathname.startsWith('/toko/barang')
  if (path === '/toko') return pathname === '/toko'
  return pathname === path || pathname.startsWith(`${path}/`)
}

export default function BottomNav() {
  const location = useLocation()
  const { user } = useAuthStore()
  const hasToko = user?.has_toko === true
  const isTokoOnly = hasToko && !user?.santri_id
  const navItems = isTokoOnly
    ? navItemsToko
    : hasToko
      ? [...navItemsSantri, { path: '/toko', label: 'Toko', icon: TokoIcon }, { path: '/toko/barang', label: 'Barang', icon: BarangIcon }]
      : navItemsSantri

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-100 flex items-stretch justify-around bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.35)]"
      style={{
        height: '64px',
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
      }}
      aria-label="Menu utama"
    >
      {navItems.map((item) => {
        const isActive = pathActive(location.pathname, item.path)
        const Icon = item.icon
        return (
          <NavLink
            key={`${item.path}-${item.label}`}
            to={item.path}
            className={`relative flex flex-1 flex-col items-center justify-center py-1.5 px-1 min-w-0 transition-colors duration-300 ${
              isActive ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            <AnimatePresence>
              {isActive && (
                <motion.div
                  key="pill"
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.85, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                  className="absolute inset-x-1.5 top-0 bottom-0 bg-primary-50 dark:bg-primary-900/25 rounded-t-2xl pointer-events-none"
                  style={{ zIndex: 0 }}
                />
              )}
            </AnimatePresence>
            <motion.div
              animate={{ scale: isActive ? 1.12 : 1, y: isActive ? -2 : 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 26 }}
              className="relative z-10 mb-0.5"
            >
              <Icon className="w-6 h-6" />
            </motion.div>
            <motion.span
              animate={{ fontSize: isActive ? '0.625rem' : '0.5625rem', fontWeight: isActive ? 600 : 500 }}
              transition={{ type: 'spring', stiffness: 400, damping: 26 }}
              className="relative z-10 text-center leading-tight max-w-full truncate px-0.5"
            >
              {item.label}
            </motion.span>
          </NavLink>
        )
      })}
    </nav>
  )
}
