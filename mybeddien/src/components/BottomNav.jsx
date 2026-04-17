import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const navItemsSantri = [
  { path: '/', label: 'Beranda', icon: HomeIcon },
  { path: '/biodata', label: 'Biodata', icon: BiodataIcon },
  { path: '/riwayat-pembayaran', label: 'Pembayaran', icon: RiwayatPembayaranIcon },
  { path: '/profil', label: 'Profil', icon: ProfilIcon },
]

const navItemsToko = [
  { path: '/', label: 'Beranda', icon: HomeIcon },
  { path: '/toko', label: 'Toko', icon: TokoIcon },
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

export default function BottomNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuthStore()
  const hasToko = user?.has_toko === true
  const isTokoOnly = hasToko && !user?.santri_id
  const navItems = isTokoOnly ? navItemsToko : (hasToko ? [...navItemsSantri, { path: '/toko', label: 'Toko', icon: TokoIcon }] : navItemsSantri)

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-20 flex items-center justify-around py-2 px-2 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 safe-area-pb">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path
        const Icon = item.icon
        return (
          <button
            key={item.path}
            type="button"
            onClick={() => navigate(item.path)}
            className={`flex flex-col items-center justify-center gap-1 min-w-[72px] py-2 px-3 rounded-xl transition-colors ${
              isActive
                ? 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
            }`}
          >
            <Icon className="w-6 h-6 shrink-0" />
            <span className="text-xs font-medium">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
