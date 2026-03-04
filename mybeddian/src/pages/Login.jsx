import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import { authAPI } from '../services/api'
import { APP_VERSION } from '../config/version'
import { useTheme } from '../contexts/ThemeContext'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
}

const itemVariants = {
  hidden: { y: 24, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 120, damping: 14 },
  },
}

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [focusedInput, setFocusedInput] = useState(null)

  const { setAuth } = useAuthStore()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const deviceInfo = authAPI.getDeviceInfo()
      const response = await authAPI.loginMybeddian(username, password, null, deviceInfo)
      if (response.success) {
        if (response.data?.device_id) {
          try {
            localStorage.setItem('mybeddian_device_id', response.data.device_id)
          } catch (_) {}
        }
        const user = response.data.user
        const allowedApps = user?.allowed_apps || []
        if (allowedApps.length && !allowedApps.includes('mybeddian') && !allowedApps.includes('uwaba')) {
          setError('Akses ditolak. Role Anda tidak memiliki izin untuk aplikasi ini.')
          return
        }
        setAuth(response.data.token, user)
        navigate(response.data.redirect_url || '/')
      } else {
        setError(response.message || 'Login gagal')
      }
    } catch (err) {
      console.error('Login error:', err)
      if (!err.response) {
        const isNetwork = err.code === 'ERR_NETWORK' || err.message === 'Network Error'
        setError(
          isNetwork
            ? 'Tidak dapat terhubung ke server API. Pastikan backend berjalan dan CORS/URL API benar.'
            : 'Tidak dapat terhubung ke server. Cek backend (XAMPP) dan VITE_API_BASE_URL di .env.'
        )
      } else if (err.response.status === 401) {
        const msg = err.response?.data?.message
        setError(msg?.includes('Terlalu banyak') ? msg : 'Username atau password salah.')
      } else if (err.response.status === 429) {
        setError(err.response?.data?.message || 'Terlalu banyak percobaan. Tunggu sebentar.')
      } else if (err.response.status >= 500) {
        setError('Kesalahan server. Coba lagi nanti.')
      } else {
        setError(err.response?.data?.message || 'Terjadi kesalahan. Coba lagi.')
      }
    } finally {
      setLoading(false)
    }
  }

  const isDark = theme === 'dark'

  return (
    <div className="min-h-screen flex flex-col md:flex-row overflow-y-auto md:overflow-hidden bg-linear-to-br from-primary-50 via-white to-primary-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Tombol gelap/terang: pojok kanan atas */}
      <button
        type="button"
        onClick={toggleTheme}
        className="fixed top-4 right-4 z-30 p-2.5 rounded-xl bg-white/90 dark:bg-gray-800/90 shadow-md border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
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

      {/* Bagian kiri: branding (desktop) */}
      <div className="hidden md:flex flex-1 relative items-center justify-center p-12 bg-linear-to-br from-primary-700 to-primary-900">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.05\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-80" />
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 text-center text-white"
        >
          <motion.h1
            className="text-4xl font-bold mb-3 tracking-tight"
            whileHover={{ scale: 1.02 }}
          >
            Mybeddian
          </motion.h1>
          <p className="text-primary-200 text-lg">Aplikasi terpadu</p>
        </motion.div>
      </div>

      {/* Form login */}
      <div className="w-full md:w-[440px] flex items-center justify-center p-6 md:p-10 shrink-0">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="w-full max-w-sm"
        >
          <motion.div
            variants={itemVariants}
            className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200/60 dark:border-gray-700 p-8"
          >
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Masuk</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Masuk ke akun Anda</p>
              <div className="flex items-center justify-center gap-2 text-xs text-gray-400 dark:text-gray-500 mt-3">
                <span className="font-mono">v{APP_VERSION}</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <motion.div variants={itemVariants} className="relative group">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Username
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </span>
                  <motion.input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onFocus={() => setFocusedInput('username')}
                    onBlur={() => setFocusedInput(null)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border-2 bg-gray-50/50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:border-primary-500 dark:focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20 transition-all"
                    placeholder="Username"
                    required
                    autoComplete="username"
                    whileFocus={{ scale: 1.01 }}
                    transition={{ type: 'spring', stiffness: 400 }}
                  />
                </div>
              </motion.div>

              <motion.div variants={itemVariants} className="relative group">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </span>
                  <motion.input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocusedInput('password')}
                    onBlur={() => setFocusedInput(null)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border-2 bg-gray-50/50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:border-primary-500 dark:focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20 transition-all"
                    placeholder="Password"
                    required
                    autoComplete="current-password"
                    whileFocus={{ scale: 1.01 }}
                    transition={{ type: 'spring', stiffness: 400 }}
                  />
                </div>
              </motion.div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 text-sm"
                >
                  {error}
                </motion.div>
              )}

              <motion.button
                variants={itemVariants}
                type="submit"
                disabled={loading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                className="w-full py-3.5 rounded-xl font-semibold bg-primary-600 hover:bg-primary-700 text-white shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Memproses...
                  </span>
                ) : (
                  'Masuk'
                )}
              </motion.button>

              <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                Belum punya akun?{' '}
                <Link to="/daftar" className="text-primary-600 dark:text-primary-400 font-medium hover:underline">
                  Daftar
                </Link>
              </p>
            </form>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}
