import { useNavigate } from 'react-router-dom'
import AnimatedOutlet from './AnimatedOutlet'
import { useAuthStore } from '../store/authStore'
import { useTheme } from '../contexts/ThemeContext'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import PwaInstallPrompt from './PwaInstallPrompt'

export default function Layout() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { theme, toggleTheme } = useTheme()
  const displayName = user?.nama || user?.username || 'Santri'
  const isDark = theme === 'dark'

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Sidebar: hanya tampil di PC (md ke atas) */}
      <Sidebar />

      {/* Area utama: header + konten */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header: muncul di semua halaman */}
        <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm shrink-0">
          <h1 className="text-lg font-semibold text-teal-700 dark:text-teal-400 tracking-tight">
            MyBeddian
          </h1>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label={isDark ? 'Mode terang' : 'Mode gelap'}
              title={isDark ? 'Gunakan mode terang' : 'Gunakan mode gelap'}
            >
              {isDark ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate max-w-[120px] sm:max-w-[180px]" title={displayName}>
              {displayName}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-red-300 dark:hover:border-red-800 transition-colors"
            >
              Keluar
            </button>
          </div>
        </header>

        {/* Main content: relative agar animasi geser (AnimatedOutlet) posisi absolute berjalan benar */}
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-16 md:pb-0 relative">
          <AnimatedOutlet />
        </main>
      </div>

      <BottomNav />

      <PwaInstallPrompt />
    </div>
  )
}
