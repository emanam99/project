import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../../store/authStore'
import { useBiodataViewStore } from '../../store/biodataViewStore'
import { useThemeStore } from '../../store/themeStore'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'
import { APP_VERSION } from '../../config/version'
import { getTanggalFromAPI } from '../../utils/hijriDate'
import { getAppEnv } from '../../services/api'

function Header() {
  const appEnv = getAppEnv()
  const isStaging = appEnv === 'staging'
  const { user } = useAuthStore()
  const biodataViewMode = useBiodataViewStore((s) => s.biodataViewMode)
  const enterBiodataEditMode = useBiodataViewStore((s) => s.enterBiodataEditMode)
  const { theme, toggleTheme } = useThemeStore()
  const { tahunHijriyah, tahunMasehi, loadTahunAjaran, lastUpdated } = useTahunAjaranStore()
  const location = useLocation()
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const [tanggalMasehi, setTanggalMasehi] = useState('')
  const [tanggalHijriyah, setTanggalHijriyah] = useState('')
  const userRef = useRef(null)

  // Load tahun ajaran saat mount dan refresh setiap 5 menit
  useEffect(() => {
    loadTahunAjaran()
    
    // Refresh setiap 5 menit untuk mendapatkan update dari pengaturan
    const interval = setInterval(() => {
      loadTahunAjaran(true) // Force refresh
    }, 5 * 60 * 1000) // 5 menit

    // Refresh saat window focus (user kembali ke tab)
    const handleFocus = () => {
      loadTahunAjaran(true) // Force refresh
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
    }
  }, [loadTahunAjaran])

  // Get page title based on route
  const isBiodataRoute = () => {
    const path = location.pathname
    return path === '/biodata' || path.startsWith('/biodata')
  }

  const getPageTitle = () => {
    const path = location.pathname
    if (path === '/' || path === '/dashboard') return 'Dashboard'
    if (path === '/biodata' || path.startsWith('/biodata')) return 'Biodata'
    if (path === '/berkas' || path.startsWith('/berkas')) return 'Berkas'
    if (path === '/pembayaran' || path.startsWith('/pembayaran')) return 'Pembayaran'
    return 'Pendaftaran'
  }

  // Get santri name from user data or show default
  const getSantriName = () => {
    // Jika user ada dan ada nama, tampilkan nama
    // Jika belum ada nama, tampilkan "Pendaftaran"
    if (user?.nama && user.nama.trim() !== '') {
      return user.nama
    }
    return 'Pendaftaran'
  }

  // Update document title when route changes
  useEffect(() => {
    const title = getPageTitle()
    document.title = `${title} - Aplikasi Pendaftaran`
  }, [location.pathname])

  // Update tanggal dari API
  const updateTanggal = async () => {
    try {
      const { masehi, hijriyah } = await getTanggalFromAPI()
      setTanggalMasehi(masehi)
      setTanggalHijriyah(hijriyah)
    } catch (error) {
      console.error('Error updating tanggal:', error)
      setTanggalMasehi('-')
      setTanggalHijriyah('-')
    }
  }

  // Update tanggal on mount and every minute
  useEffect(() => {
    updateTanggal()
    const interval = setInterval(updateTanggal, 60000) // Update setiap 1 menit
    return () => clearInterval(interval)
  }, [])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userRef.current && !userRef.current.contains(event.target)) {
        setShowUserDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = () => {
    const { logout } = useAuthStore.getState()
    logout()
    window.location.href = '/login'
  }

  return (
    <header className={`${isStaging ? 'bg-red-600 dark:bg-red-800' : 'bg-primary-600 dark:bg-primary-800'} text-white p-3 rounded-lg mb-2 shadow-lg flex items-start md:items-center justify-between relative gap-3 mx-2 sm:mx-3 mt-2`}>
      {/* Left Section - Title */}
      <div className="flex-1 min-w-0 relative">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <h1 className="text-xl md:text-2xl font-bold truncate">{getSantriName()}</h1>
            <p className="text-sm md:text-base text-primary-100 mt-1">{getPageTitle()}</p>
          </div>
          {/* Tahun Ajaran Label */}
          <div className="hidden sm:flex flex-col gap-1 px-3 py-1.5 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20">
            <span className="text-xs text-primary-100">Tahun Ajaran:</span>
            <div className="flex items-center gap-1">
              <span className="text-xs font-semibold text-white">{tahunHijriyah || '-'}</span>
              <span className="text-xs text-primary-100">/</span>
              <span className="text-xs font-semibold text-white">{tahunMasehi || '-'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Section - Theme Toggle & User */}
      <div className="relative flex items-center gap-3 flex-shrink-0">
        {isBiodataRoute() && biodataViewMode === 'read' && (
          <button
            type="button"
            onClick={() => enterBiodataEditMode()}
            className="px-3 py-2 rounded-lg bg-white/20 hover:bg-white/30 border border-white/40 text-white text-sm font-semibold transition-colors whitespace-nowrap"
            title="Ubah data biodata"
          >
            Ubah
          </button>
        )}
        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center cursor-pointer hover:bg-white/30 transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? (
            <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>

        {/* User Avatar + Staging badge (di bawah ikon) */}
        <div className="relative flex flex-col items-center gap-1" ref={userRef}>
          <button
            onClick={() => setShowUserDropdown(!showUserDropdown)}
            className="w-11 h-11 rounded-full bg-white flex items-center justify-center cursor-pointer shadow-lg border-2 border-gray-200 hover:border-primary-300 transition-colors"
          >
            <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </button>
          {isStaging && (
            <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-1.5 py-0.5 rounded whitespace-nowrap" title="Mode staging">Staging</span>
          )}

          {/* User Dropdown */}
          <AnimatePresence>
            {showUserDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-xl border dark:border-gray-700 py-2 text-gray-700 dark:text-gray-200 z-50"
              >
                <div className="flex flex-col items-center px-4 pt-4 pb-3 border-b dark:border-gray-700">
                  <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-2 border border-gray-200 dark:border-gray-600">
                    <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="font-semibold text-gray-800 dark:text-gray-200 text-base">{user?.nama || 'Santri'}</div>
                  {user?.nik && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">NIK: {user.nik}</div>
                  )}
                  <div className="mt-2 w-full text-left space-y-0.5 text-[11px] text-gray-600 dark:text-gray-300 font-mono border-t border-gray-100 dark:border-gray-600 pt-2">
                    <div>
                      <span className="text-gray-400 dark:text-gray-500">NIS</span>
                      <span className="ml-1">{user?.nis != null && String(user.nis).trim() !== '' ? user.nis : '—'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 dark:text-gray-500">ID Santri</span>
                      <span className="ml-1">{user?.id != null && String(user.id).trim() !== '' ? user.id : '—'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 dark:text-gray-500">ID Registrasi</span>
                      <span className="ml-1">{user?.id_registrasi != null && user.id_registrasi !== '' ? user.id_registrasi : '—'}</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>

                {/* Theme Toggle - Paling Atas */}
                <div className="w-full text-left px-4 py-2 flex items-center gap-2">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                  <span className="flex-1">Tema</span>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={theme === 'dark'}
                      onChange={toggleTheme}
                      className="sr-only"
                    />
                    <span className={`w-10 h-6 flex items-center rounded-full p-1 duration-300 ${
                      theme === 'dark' ? 'bg-primary-600' : 'bg-gray-200'
                    }`}>
                      <motion.span
                        animate={{
                          x: theme === 'dark' ? 16 : 0
                        }}
                        className="bg-white w-4 h-4 rounded-full shadow-md transform duration-300"
                      />
                    </span>
                  </label>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>

                {/* Tahun Ajaran */}
                <div className="w-full px-4 py-2">
                  <div className="text-center">
                    <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Tahun Ajaran:</span>
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{tahunHijriyah || '-'}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400"> / </span>
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{tahunMasehi || '-'}</span>
                    </div>
                  </div>
                </div>

                {/* Versi & Tanggal Box */}
                <div 
                  className="flex flex-row items-center justify-between bg-white dark:bg-gray-700 rounded-xl px-4 py-3 border dark:border-gray-600 border-gray-200 shadow-md gap-4 transition hover:shadow-lg mx-4 my-2 cursor-pointer"
                  onClick={updateTanggal}
                  title="Klik untuk refresh tanggal"
                >
                  <div className="flex flex-col items-center">
                    <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7a1 1 0 011-1h8a1 1 0 011 1v8a1 1 0 01-1 1H8a1 1 0 01-1-1V7z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7l10 10" />
                      </svg>
                      Versi
                    </span>
                    <span className="font-mono text-base text-gray-800 dark:text-gray-200">{APP_VERSION}</span>
                  </div>
                  <div className="flex flex-col items-center border-l dark:border-gray-600 border-gray-200 pl-4">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span className="font-mono text-xs text-gray-800 dark:text-gray-200">{tanggalMasehi}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z" />
                      </svg>
                      <span className="font-mono text-xs text-gray-800 dark:text-gray-200">{tanggalHijriyah}</span>
                    </div>
                  </div>
                </div>
                
                <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                
                <button 
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-red-600 dark:text-red-400 flex items-center gap-2"
                  onClick={handleLogout}
                >
                  <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2h4a2 2 0 012 2v1" />
                  </svg>
                  Log Out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  )
}

export default Header
